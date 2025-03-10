use std::{collections::HashMap, io::ErrorKind, path::PathBuf};

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_inline_default::serde_inline_default;
use sqlx::SqlitePool;
use tokio::{fs::File, io::AsyncWriteExt};
use tracing::instrument;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success,
    users::PublicUser,
    utils::Normalize,
    SuccessResponse, UPLOAD_DIR,
};

/// All data for the uploaded file.
/// All encrypted fields are expected to be encrypted
/// by the provided key, except for the key itself
/// which is expected to be encrypted by the user's public key
#[derive(Deserialize, Serialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadMetadata {
    /// The encrypted name of the file to be uploaded
    #[schema(content_encoding = "base64")]
    pub encrypted_file_name: String,
    /// The encrypted mime type of the file to be uploaded
    /// Optional in case the mime type is not known
    #[schema(content_encoding = "base64")]
    pub encrypted_mime_type: Option<String>,
    /// The key used to encrypt the file
    /// Should be encrypted by the user's public key
    #[schema(content_encoding = "base64")]
    pub encrypted_key: String,
    /// The nonce for the file (not encrypted)
    #[schema(content_encoding = "base64")]
    pub nonce: String,
    /// Whether the file is a directory
    #[serde(default)]
    pub is_directory: bool,
    /// The direct parent id of the file
    /// Should be null if in the root directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<Uuid>,
}

/// The size and id of the uploaded file
/// Also has a flag to indicate if the file is a directory
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadResponse {
    id: Uuid,
    size: i64,
    is_directory: bool,
}

/// A request to upload a file
// We need to add allow unused to avoid warnings
// as this type is only used for documentation
// and isn't actually used anywhere in the code
#[derive(ToSchema)]
#[allow(unused)]
pub struct UploadRequest {
    #[schema(content_encoding = "application/json")]
    metadata: UploadMetadata,
    /// The encrypted file data as bytes
    #[schema(format = Binary, content_media_type = "application/octet-stream")]
    file: String,
}

#[utoipa::path(
    post,
    path = "/api/upload",
    request_body(content = UploadRequest, content_type = "multipart/form-data"),
    responses(
        (status = OK, description = "The file was uploaded successfully", body = UploadResponse),
        (status = BAD_REQUEST, description = "The file metadata or file data was not provided or provided incorrectly", body = ErrorResponse),
    ),
    security(
        (),
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn upload_file(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    mut data: Multipart,
) -> Result<Response, AppError> {
    let mut metadata: Option<UploadMetadata> = None;
    let uuid = user.map(|user| user.0.id);
    let file_id = Uuid::now_v7();
    let mut file_path: Option<PathBuf> = None;
    // Allocate a megabyte buffer
    let mut file_data: Vec<u8> = Vec::with_capacity(1024 * 1024);

    while let Some(mut field) = data.next_field().await? {
        match field.name() {
            Some("metadata") => {
                metadata = Some(serde_json::from_slice(&field.bytes().await?)?);
            }
            Some("file") => {
                file_path = Some(UPLOAD_DIR.join(file_id.to_string()));

                while let Some(chunk) = field.chunk().await? {
                    file_data.extend_from_slice(&chunk);
                }
            }
            _ => {}
        }
    }

    let Some(metadata) = metadata else {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Missing file metadata".into(),
        )));
    };

    if let Some(parent_file) = sqlx::query!(
        r#"SELECT is_directory AS "is_directory!" FROM file WHERE id = ?"#,
        metadata.parent_id
    )
    .fetch_optional(&state.pool)
    .await?
    {
        if !parent_file.is_directory {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Parent file is not a directory".into(),
            )));
        }
    }

    let file_size = if !metadata.is_directory {
        let Some(file_path) = file_path else {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Missing file".into(),
            )));
        };
        let mut file = File::create(file_path).await?;
        file.write_all(&file_data).await?;
        file_data.len() as i64
    } else {
        0
    };
    match sqlx::query!(
        "INSERT INTO file (id, owner_id, parent_id, encrypted_key, encrypted_name, mime, nonce, is_directory, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        file_id,
        uuid,
        metadata.parent_id,
        metadata.encrypted_key,
        metadata.encrypted_file_name,
        metadata.encrypted_mime_type,
        metadata.nonce,
        metadata.is_directory,
        file_size,
    )
    .execute(&state.pool)
    .await {
        // If a FOREIGN KEY constraint is violated, it likely means that the parent id is invalid
        // this is a user error and not a server error, so report it as such.
            Err(e)
                if e.as_database_error()
                    .and_then(|e| e.code())
                    .is_some_and(|code| code == "787") =>
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Invalid parent id".into(),
                )))
            }
        Err(e) => return Err(e.into()),
        _ => {}
    }

    Ok((
        StatusCode::OK,
        Json(UploadResponse {
            id: file_id,
            size: file_size,
            is_directory: metadata.is_directory,
        }),
    )
        .into_response())
}

#[utoipa::path(
    delete,
    path = "/api/file/{id}",
    description = "Delete a file. Recursively deletes all children if the file is a directory",
    params(
            ("id" = Uuid, Path, description = "The id of the file to delete"),
        ),
    responses(
        (status = OK, description = "The file was deleted successfully", body = SuccessResponse),
        (status = BAD_REQUEST, description = "File id was not provided", body = ErrorResponse),
        (status = NOT_FOUND, description = "File was not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn delete_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    // Check if the user owns the file
    // Check if the new parent is owned by the user
    let Some(file) = sqlx::query!(
        "SELECT is_directory FROM file WHERE id = ? AND owner_id = ?",
        id,
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        // Return an error if the user doen't own the file
        // or the file doesn't exist
        // This is to prevent users from deleting files they don't own
        // or attempting to snoop on files they don't have access to
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    };

    // Only delete the file on the local file system if it is not a directory
    // This is because we don't actually store created directories on the file system
    if !file.is_directory {
        // If the file exists, delete it
        match std::fs::remove_file(&*UPLOAD_DIR.join(id.to_string())) {
            // A not found error likely means that the file was already deleted
            // so just ignore it.
            // Any other error likely means that there actually is a file
            // system error so return it as an error.
            Err(e) if e.kind() != ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    }

    // The user owns the file so delete it
    sqlx::query!("DELETE FROM file WHERE id = ?", id)
        .execute(&state.pool)
        .await?;

    Ok((StatusCode::OK, success!("File deleted successfully")).into_response())
}

#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UpdateFile {
    /// Move the file to a new parent
    Move {
        /// The new parent id of the file
        parent_id: Option<Uuid>,
        #[schema(
            example = "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc=",
            content_encoding = "base64"
        )]
        encrypted_key: String,
    },
    /// Rename the file
    Rename {
        /// The new encrypted name of the file
        #[schema(
            example = "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc=",
            content_encoding = "base64"
        )]
        encrypted_name: String,
    },
}

#[utoipa::path(
    put,
    path = "/api/file/{id}",
    description = "Update a file or directory. Can be used to move or rename a file",
    request_body(content = UpdateFile, content_type = "application/json"),
    params(
            ("id" = Uuid, Path, description = "The id of the file to update"),
        ),
    responses(
        (status = OK, description = "The file was updated successfully", body = SuccessResponse),
        (status = BAD_REQUEST, description = "File id was not provided or the new parent is not a directory", body = ErrorResponse),
        (status = NOT_FOUND, description = "File was not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn update_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFile>,
) -> Result<Response, AppError> {
    // Check if the user owns the file
    if !is_owner(&state.pool, &user.id, &id).await? {
        // Return an error if the user doen't own the file
        // or the file doesn't exist
        // This is to prevent users from updating files they don't own
        // or attempting to snoop on files they don't have access to
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "Source file not found".into(),
        )));
    }
    match body {
        UpdateFile::Move {
            parent_id,
            encrypted_key,
        } => {
            // Check if the new parent is owned by the user
            let Some(parent_file) = sqlx::query!(
                "SELECT is_directory FROM file WHERE id = ? AND owner_id = ?",
                parent_id,
                user.id
            )
            .fetch_optional(&state.pool)
            .await?
            else {
                return Err(AppError::UserError((
                    StatusCode::NOT_FOUND,
                    "Destination file not found".into(),
                )));
            };

            // Check that the new parent is a directory
            if !parent_file.is_directory {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Cannot set file parent to non-directories".into(),
                )));
            }

            // Update the parent id of the file
            sqlx::query!(
                "UPDATE file SET parent_id = ?, encrypted_key = ? WHERE id = ?",
                parent_id,
                encrypted_key,
                id
            )
            .execute(&state.pool)
            .await?;
        }
        UpdateFile::Rename { encrypted_name } => {
            // Rename the file
            sqlx::query!(
                "UPDATE file SET encrypted_name = ? WHERE id = ?",
                encrypted_name,
                id
            )
            .execute(&state.pool)
            .await?;
        }
    }

    Ok((StatusCode::OK, success!("File updated successfully")).into_response())
}

/// Check if a user owns a file
pub async fn is_owner(pool: &SqlitePool, user: &Uuid, file: &Uuid) -> Result<bool, AppError> {
    Ok(sqlx::query!(
        "SELECT owner_id FROM file WHERE id = ? AND owner_id = ?",
        file,
        user
    )
    .fetch_optional(pool)
    .await?
    .is_some())
}

/// Metadata of a file or directory
#[derive(Serialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    /// The id of the file or directory
    pub id: Uuid,
    #[serde(flatten)]
    pub upload: UploadMetadata,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub owner_id: Option<Uuid>,
    /// The children of the directory.
    /// Only present if the file is a directory.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Uuid>,
}

#[derive(Deserialize, IntoParams, Debug)]
#[serde_inline_default]
pub struct FileQuery {
    /// The id of the file or directory to get.
    /// If not provided, the root of the currently
    /// authorized user directory is returned
    pub id: Option<Uuid>,
    /// The maximum depth to return children for
    #[serde_inline_default(1)]
    #[param(maximum = 20, default = 1)]
    pub depth: u32,
    /// The offset to start returning children from
    #[param(default = 0)]
    #[serde_inline_default(0)]
    pub offset: u32,
    /// The maximum number of children to return
    #[param(default = 50)]
    #[serde_inline_default(50)]
    pub limit: u32,
}

impl FileMetadata {
    fn example() -> HashMap<Uuid, Self> {
        let parent_uuid = Uuid::try_parse_ascii(b"123e4567-e89b-12d3-a456-426614174000").unwrap();
        let child_uuid = Uuid::try_parse_ascii(b"21f981a7-d21f-4aa5-9f6b-09005235236a").unwrap();

        let now = Utc::now();
        let first = FileMetadata {
            id: parent_uuid,
            upload: UploadMetadata {
                encrypted_file_name: "encryptedFileName".into(),
                encrypted_mime_type: Some("encryptedMimeType".into()),
                encrypted_key: "encryptedKey".into(),
                nonce: "exampleNonce".into(),
                is_directory: true,
                parent_id: None,
            },
            created_at: now,
            modified_at: now,
            owner_id: Some(Uuid::try_parse_ascii(b"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86").unwrap()),
            children: vec![child_uuid],
        };
        let child = FileMetadata {
            id: child_uuid,
            upload: UploadMetadata {
                encrypted_file_name: "encryptedFileName".into(),
                encrypted_mime_type: Some("encryptedMimeType".into()),
                encrypted_key: "encryptedKey".into(),
                nonce: "exampleNonce".into(),
                is_directory: false,
                parent_id: Some(parent_uuid),
            },
            created_at: now,
            modified_at: now,
            owner_id: Some(Uuid::try_parse_ascii(b"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86").unwrap()),
            children: vec![],
        };
        HashMap::from([(parent_uuid, first), (child_uuid, child)])
    }
}

#[derive(Serialize, ToSchema)]
pub struct FileResponse {
    #[schema(
        example = FileMetadata::example
    )]
    pub files: HashMap<Uuid, FileMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "same kind of thing as files, but with `PublicUser` schema...")]
    pub users: Option<HashMap<Uuid, PublicUser>>,
    #[schema(example = "123e4567-e89b-12d3-a456-426614174000")]
    pub root: Vec<Uuid>,
}
#[utoipa::path(
    get,
    path = "/api/file",
    description = "Get the metadata of a file or directory. Also returns the children of a directory. This does not return a `users` object for the time being, as all files and directories are assumed to be owned by the querying user.",
    params(
        FileQuery
    ),
    responses(
        (status = OK, description = "The file or directory metadata was retrieved successfully", body = FileResponse),
        (status = BAD_REQUEST, description = "No file id or user authoziation provided", body = ErrorResponse),
        (status = NOT_FOUND, description = "File was not found"),
    ),
    security(
        (),
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn get_file_metadata(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    Query(params): Query<FileQuery>,
) -> Result<Response, AppError> {
    // Limit the depth to 20 to prevent infinite recursion
    let depth = params.depth.min(20);
    if params.id.is_none() && user.is_none() {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "No file id or user authorization provided".into(),
        )));
    }
    let user_id = user.map(|user| user.0.id);
    let query = sqlx::query!(
        r#"
            WITH RECURSIVE children AS (
                -- Anchor member (root or specified node)
                SELECT 
                    0 AS depth,
                    id, 
                    parent_id, 
                    encrypted_name, 
                    encrypted_key, 
                    owner_id,
                    nonce, 
                    is_directory, 
                    mime,
                    size,
                    created_at,
                    modified_at
                FROM file
                WHERE 
                owner_id = COALESCE(?, owner_id) AND
                IIF(? IS NULL, parent_id IS NULL, id = ?)
                UNION ALL
                
                -- Recursive member
                SELECT 
                    c.depth + 1,
                    f.id, 
                    f.parent_id, 
                    f.encrypted_name, 
                    f.encrypted_key, 
                    f.owner_id,
                    f.nonce, 
                    f.is_directory, 
                    f.mime,
                    f.size,
                    f.created_at,
                    f.modified_at
                FROM file f
                JOIN children c ON f.parent_id = c.id
                WHERE 
                    c.depth < ? 
                ORDER BY c.depth + 1
            )
            SELECT 
                -- Goofy ahh workaround to get the query to work with sqlx
                depth AS "depth!: u32",
                id AS "id: Uuid",
                parent_id AS "parent_id: Uuid", 
                encrypted_name, 
                encrypted_key, 
                owner_id AS "owner_id: Uuid",
                nonce, 
                is_directory AS "is_directory!",
                mime,
                size,
                created_at,
                modified_at
            FROM children ORDER BY depth ASC LIMIT ? OFFSET ?
            "#,
        user_id,
        params.id,
        params.id,
        depth,
        params.limit,
        params.offset
    )
    .fetch_all(&state.pool)
    .await?;
    // Convert the query result into a tree structure
    let (files, root) = query
        .into_iter()
        .map(|row| FileMetadata {
            id: row.id,
            created_at: row.created_at.and_utc(),
            modified_at: row.modified_at.and_utc(),
            owner_id: row.owner_id,
            upload: UploadMetadata {
                encrypted_file_name: row.encrypted_name,
                encrypted_mime_type: row.mime,
                encrypted_key: row.encrypted_key,
                nonce: row.nonce,
                is_directory: row.is_directory,
                parent_id: row.parent_id,
            },
            children: Vec::new(),
        })
        .normalize();
    if params.id.is_some() && files.is_empty() {
        Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )))
    } else {
        Ok((
            StatusCode::OK,
            Json(FileResponse {
                users: None,
                files,
                root,
            }),
        )
            .into_response())
    }
}

#[utoipa::path(
    get,
    path = "/api/file/data/{id}",
    description = "Get the raw contents of a file",
    params(
            ("id" = Uuid, Path, description = "The id of the file to get"),
        ),
    responses(
        (status = OK, description = "The file was retrieved successfully", content_type = "application/octet-stream"),
        (status = NOT_FOUND, description = "File was not found"),
    ),
)]
// Dummy function to avoid generate documentation for this path
#[allow(unused)]
async fn get_file() {}
