use std::{collections::HashMap, io::ErrorKind, path::PathBuf};

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_inline_default::serde_inline_default;
use sqlx::SqlitePool;
use tokio::{fs::File, io::AsyncWriteExt};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success, SuccessResponse, UPLOAD_DIR,
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
    encrypted_file_name: String,
    /// The encrypted mime type of the file to be uploaded
    /// Optional in case the mime type is not known
    #[schema(content_encoding = "base64")]
    encrypted_mime_type: Option<String>,
    /// The key used to encrypt the file
    /// Should be encrypted by the user's public key
    #[schema(content_encoding = "base64")]
    encrypted_key: String,
    /// The nonce for the file (not encrypted)
    #[schema(content_encoding = "base64")]
    nonce: String,
    /// Whether the file is a directory
    #[serde(default)]
    is_directory: bool,
    /// The direct parent id of the file
    /// Should be null if in the root directory
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_id: Option<Uuid>,
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
pub async fn upload_file(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    mut data: Multipart,
) -> Result<Response, AppError> {
    let mut metadata: Option<UploadMetadata> = None;
    let uuid = user.map(|user| Uuid::from_bytes(user.0.id));
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
pub async fn delete_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    let uuid = Uuid::from_bytes(user.id);
    // Check if the user owns the file
    // Check if the new parent is owned by the user
    let Some(file) = sqlx::query!(
        "SELECT is_directory FROM file WHERE id = ? AND owner_id = ?",
        id,
        uuid
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
    if file.is_directory.is_none_or(|is_directory| !is_directory) {
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum UpdateFile {
    /// Move the file to a new parent
    Move(
        /// The new parent id of the file
        Uuid,
    ),
    /// Rename the file
    Rename(
        /// The new encrypted name of the file
        Box<str>,
    ),
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
pub async fn update_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFile>,
) -> Result<Response, AppError> {
    let uuid = Uuid::from_bytes(user.id);
    // Check if the user owns the file
    if !is_owner(&state.pool, &uuid, &id).await? {
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
        UpdateFile::Move(parent_id) => {
            // Check if the new parent is owned by the user
            let Some(parent_file) = sqlx::query!(
                "SELECT is_directory FROM file WHERE id = ? AND owner_id = ?",
                parent_id,
                uuid
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
            if !parent_file
                .is_directory
                .is_some_and(|is_directory| is_directory)
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Cannot set file parent to non-directories".into(),
                )));
            }

            // Update the parent id of the file
            sqlx::query!("UPDATE file SET parent_id = ? WHERE id = ?", parent_id, id)
                .execute(&state.pool)
                .await?;
        }
        UpdateFile::Rename(name) => {
            // Rename the file
            sqlx::query!("UPDATE file SET encrypted_name = ? WHERE id = ?", name, id)
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
    id: Uuid,
    #[serde(flatten)]
    upload: UploadMetadata,
    /// The children of the directory.
    /// Only present if the file is a directory.
    /// This is a recursive definition so it can be used to get the entire directory tree,
    /// the children will also have their children and so on.
    #[schema(no_recursion, example = "Recursive definition...")]
    #[serde(skip_serializing_if = "Vec::is_empty")]
    children: Vec<FileMetadata>,
}

#[derive(Deserialize, IntoParams)]
#[serde_inline_default]
pub struct FileQuery {
    /// The id of the file or directory to get.
    /// If not provided, the root of the currently
    /// authorized user directory is returned
    id: Option<Uuid>,
    /// The maximum depth to return children for
    #[serde_inline_default(1)]
    #[param(maximum = 20, default = 1)]
    depth: u32,
    /// The offset to start returning children from
    #[param(default = 0)]
    #[serde_inline_default(0)]
    offset: u32,
    /// The maximum number of children to return
    #[param(default = 50)]
    #[serde_inline_default(50)]
    limit: u32,
}

#[utoipa::path(
    get,
    path = "/api/file",
    description = "Get the metadata of a file or directory. Also returns the children of a directory",
    params(
        FileQuery
    ),
    responses(
        (status = OK, description = "The file or directory metadata was retrieved successfully", body = FileMetadata),
        (status = ACCEPTED, description = "The root directory metadata was retrieved successfully. Uses a different response code from the regular response because root directories don't have metadata, so we can only return their children", body = [FileMetadata]),
        (status = BAD_REQUEST, description = "No file id or user authoziation provided", body = ErrorResponse),
        (status = NOT_FOUND, description = "File was not found"),
    ),
    security(
        (),
        ("lokr_session_cookie" = [])
    )
)]
pub async fn get_file_metadata(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    Query(params): Query<FileQuery>,
) -> Result<Response, AppError> {
    // Limit the depth to 20 to prevent infinite recursion
    let depth = params.depth.min(20);
    match (params.id, user) {
        (Some(id), _) => {
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
                    nonce, 
                    is_directory, 
                    mime,
                    size,
                    created_at,
                    modified_at
                FROM file
                WHERE 
                    parent_id = ?
                UNION ALL
                
                -- Recursive member
                SELECT 
                    c.depth + 1,
                    f.id, 
                    f.parent_id, 
                    f.encrypted_name, 
                    f.encrypted_key, 
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
                depth as "depth!: u32",
                id, 
                parent_id, 
                encrypted_name, 
                encrypted_key, 
                nonce, 
                is_directory, 
                mime,
                size,
                created_at,
                modified_at
            FROM (SELECT * FROM children ORDER BY depth LIMIT ? OFFSET ?) ORDER BY depth DESC
            "#,
                id,
                depth,
                params.limit,
                params.offset
            )
            .fetch_all(&state.pool)
            .await?;
            // Convert the query result into a tree structure
            let root = query
                .into_iter()
                .map(|row| FileMetadata {
                    id: Uuid::from_slice(&row.id[..]).expect("Should be a valid uuid"),
                    upload: UploadMetadata {
                        encrypted_file_name: row.encrypted_name,
                        encrypted_mime_type: row.mime,
                        encrypted_key: row.encrypted_key,
                        nonce: row.nonce,
                        is_directory: row.is_directory.is_some_and(|is_directory| is_directory),
                        parent_id: row
                            .parent_id
                            .map(|id| Uuid::from_slice(&id[..]).expect("Should be a valid uuid")),
                    },
                    children: Vec::new(),
                })
                // Form a file hierarchy by starting at the deepest level of children and working
                // up row by row. The query is ordered by depth in descending order so the children
                // are always processed in order.
                .fold(
                    HashMap::new(),
                    |mut acc: HashMap<Option<Uuid>, Vec<FileMetadata>>, mut cur| {
                        // Check if the current file has children that we have previously
                        // saved in our accumulator. If so, then we can move those
                        // children to the current file.
                        if let Some(children) = acc.remove(&Some(cur.id)) {
                            cur.children = children;
                        }
                        // Add the current file to the accumulator based on its parent_id
                        // so that we can later move its children to it if they exist.
                        acc.entry(cur.upload.parent_id)
                            .and_modify(|entry| entry.push(cur.clone()))
                            .or_insert_with(|| vec![cur]);
                        acc
                    },
                )
                // Files and directories in the root should have a parent_id of None so we remove it from the map
                // If everything went well, the only key left in the map should be None. As
                // childern are moved to their parents, their parent_id is removed from the map.
                .remove(&Some(id))
                // A user may have no files, so we default to an empty root directory
                .unwrap_or_default();
            Ok((StatusCode::OK, Json(root)).into_response())
        }
        (_, Some(SessionAuth(user))) => {
            let uuid = Uuid::from_bytes(user.id);
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
                    nonce, 
                    is_directory, 
                    mime,
                    size,
                    created_at,
                    modified_at
                FROM file
                WHERE 
                    parent_id IS NULL AND
                    owner_id = ?
                UNION ALL
                
                -- Recursive member
                SELECT 
                    c.depth + 1,
                    f.id, 
                    f.parent_id, 
                    f.encrypted_name, 
                    f.encrypted_key, 
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
                depth as "depth!: u32",
                id, 
                parent_id, 
                encrypted_name, 
                encrypted_key, 
                nonce, 
                is_directory, 
                mime,
                size,
                created_at,
                modified_at
            FROM (SELECT * FROM children ORDER BY depth LIMIT ? OFFSET ?) ORDER BY depth DESC
            "#,
                uuid,
                depth,
                params.limit,
                params.offset
            )
            .fetch_all(&state.pool)
            .await?;
            // Convert the query result into a tree structure
            let root = query
                .into_iter()
                .map(|row| FileMetadata {
                    id: Uuid::from_slice(&row.id[..]).expect("Should be a valid uuid"),
                    upload: UploadMetadata {
                        encrypted_file_name: row.encrypted_name,
                        encrypted_mime_type: row.mime,
                        encrypted_key: row.encrypted_key,
                        nonce: row.nonce,
                        is_directory: row.is_directory.is_some_and(|is_directory| is_directory),
                        parent_id: row
                            .parent_id
                            .map(|id| Uuid::from_slice(&id[..]).expect("Should be a valid uuid")),
                    },
                    children: Vec::new(),
                })
                // Form a file hierarchy by starting at the deepest level of children and working
                // up row by row. The query is ordered by depth in descending order so the children
                // are always processed in order.
                .fold(
                    HashMap::new(),
                    |mut acc: HashMap<Option<Uuid>, Vec<FileMetadata>>, mut cur| {
                        // Check if the current file has children that we have previously
                        // saved in our accumulator. If so, then we can move those
                        // children to the current file.
                        if let Some(children) = acc.remove(&Some(cur.id)) {
                            cur.children = children;
                        }
                        // Add the current file to the accumulator based on its parent_id
                        // so that we can later move its children to it if they exist.
                        acc.entry(cur.upload.parent_id)
                            .and_modify(|entry| entry.push(cur.clone()))
                            .or_insert_with(|| vec![cur]);
                        acc
                    },
                )
                // Files and directories in the root should have a parent_id of None so we remove it from the map
                // If everything went well, the only key left in the map should be None. As
                // childern are moved to their parents, their parent_id is removed from the map.
                .remove(&None)
                // A user may have no files, so we default to an empty root directory
                .unwrap_or_default();
            Ok((StatusCode::ACCEPTED, Json(root)).into_response())
        }
        _ => Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "No file id or user authorization provided".into(),
        ))),
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
