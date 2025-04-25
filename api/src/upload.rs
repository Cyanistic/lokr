use std::{future::Future, io::ErrorKind, path::PathBuf};

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use axum_extra::{headers::Cookie, TypedHeader};
use base64::{engine::general_purpose, Engine};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Sqlite};
use tokio::{
    fs::{create_dir_all, remove_dir_all, remove_file, File},
    io::{copy, AsyncWriteExt, BufReader, BufWriter},
};
use tracing::{error, instrument};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    check_nonce,
    error::{AppError, ErrorResponse},
    share::{share_with_link, ShareResponse},
    state::AppState,
    success,
    users::BinaryFile,
    utils::retry_transaction_fn,
    SuccessResponse, MAX_FILE_SIZE, TRANSACTION_DIR, UPLOAD_DIR,
};

const ROOT_FILE_ENCRYPTED_KEY_LENGTH: usize = 512;
const CHILD_FILE_ENCRYPTED_KEY_LENGTH: usize = 48;

/// All data for the uploaded file.
/// All encrypted fields are expected to be encrypted
/// by the provided key, except for the key itself
/// which is expected to be encrypted by the user's public key
#[derive(Deserialize, Debug, Serialize, ToSchema, Clone)]
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
    /// We need to use a diffent nonce for each
    /// piece of data that we encrypt for security reasons
    /// The nonce for the file (not encrypted) can be null
    /// if the file is a directory
    #[schema(content_encoding = "base64")]
    pub file_nonce: Option<String>,
    /// The nonce for the encryption key (not encrypted)
    /// Not neeeded if the file is in the root directory
    #[schema(content_encoding = "base64")]
    pub key_nonce: Option<String>,
    /// The nonce for the file name (not encrypted)
    #[schema(content_encoding = "base64")]
    pub name_nonce: String,
    /// The nonce for the file mime type(not encrypted)
    /// can be null if the file does not have a mime type
    #[schema(content_encoding = "base64")]
    pub mime_type_nonce: Option<String>,
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
    /// Used to handle the case where the file is uploaded
    /// by an anonymous user.
    #[serde(skip_serializing_if = "Option::is_none")]
    link: Option<ShareResponse>,
}

/// A request to upload a file
// We need to add allow unused to avoid warnings
// as this type is only used for documentation
// and isn't actually used anywhere in the code
#[derive(ToSchema)]
#[allow(unused)]
#[schema(rename_all = "camelCase")]
pub struct UploadRequest {
    #[schema(content_encoding = "application/json")]
    metadata: UploadMetadata,
    /// The encrypted file data as bytes
    #[schema(format = Binary, content_media_type = "application/octet-stream", required = false)]
    file: String,
}

// Define cleanup function to remove file on error
async fn cleanup(path: Option<&PathBuf>) {
    if let Some(path) = path {
        if let Err(e) = tokio::fs::remove_file(path).await {
            // Only log the error if it's not a "file not found" error
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("Failed to clean up file on error: {}", e);
            }
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/upload",
    description = "Upload a file to the backend. This endpoint is also used to create folders",
    request_body(content = UploadRequest, content_type = "multipart/form-data"),
    params(
        LinkParams,
    ),
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
    TypedHeader(cookies): TypedHeader<Cookie>,
    Query(params): Query<LinkParams>,
    mut data: Multipart,
) -> Result<Response, AppError> {
    let mut metadata: Option<UploadMetadata> = None;
    let uuid = user.map(|user| user.0.id);
    let file_id = Uuid::now_v7();
    let mut file_path: Option<PathBuf> = None;
    let mut file_size: i64 = 0;
    let mut writer: Option<BufWriter<File>> = None;
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());

    // Use a Result to handle early returns and cleanup
    let result: Result<_, AppError> = async {
        // Note that here we assume that the metadata is sent before the file data
        // if this is not done, then parsing is more complex.
        while let Some(mut field) = data.next_field().await? {
            match field.name() {
                Some("metadata") => {
                    metadata = Some(serde_json::from_slice(&field.bytes().await?)?);
                }
                Some("file") => {
                    if metadata.as_ref().is_some_and(|m| m.is_directory) || file_path.is_some() {
                        // Skip file processing for directories or if we
                        // already have data for a file
                        continue;
                    }

                    file_path = Some(UPLOAD_DIR.join(file_id.to_string()));

                    if let Some(path) = &file_path {
                        let file = File::create(path).await?;
                        let mut buf_writer = BufWriter::with_capacity(64 * 1024, file);

                        while let Some(chunk) = field.chunk().await? {
                            buf_writer.write_all(&chunk).await?;
                            file_size += chunk.len() as i64;
                        }

                        // Flush the buffer to ensure all data is written
                        buf_writer.flush().await?;
                        writer = Some(buf_writer);
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

        check_upload_metadata(&metadata, uuid.is_some())?;

        let link = metadata
            .retry_upload_transaction(
                &state,
                &uuid,
                &params,
                link_password.as_deref(),
                file_id,
                file_size,
            )
            .await?;

        // Finalize the write operation by dropping the writer
        drop(writer);

        Ok((
            StatusCode::OK,
            Json(UploadResponse {
                id: file_id,
                size: file_size,
                is_directory: metadata.is_directory,
                link,
            }),
        )
            .into_response())
    }
    .await;

    // Handle cleanup on error
    match result {
        Ok(response) => Ok(response),
        Err(e) => {
            cleanup(file_path.as_ref()).await;
            Err(e)
        }
    }
}

async fn get_owner_from_parent<'a, E>(
    parent_id: Option<&Uuid>,
    key_nonce: Option<&str>,
    uuid: &Option<Uuid>,
    link_password: Option<&str>,
    link_id: Option<&Uuid>,
    db: E,
) -> Result<Option<Uuid>, AppError>
where
    E: Executor<'a, Database = Sqlite>,
{
    // Get the owner id of the file so we can reuse it, as the file owner for children should
    // be the same as the the owner id of the parent
    let owner_id = match parent_id {
        // Check if the user has permission to upload the file to the parent directory
        Some(parent_id) => {
            match sqlx::query!(
                r#"
                WITH RECURSIVE ancestors AS (
                    SELECT
                        id,
                        parent_id
                    FROM file
                    WHERE id = ?  -- the file we're checking
                    UNION ALL
                    SELECT
                        f.id,
                        f.parent_id
                    FROM file f
                    JOIN ancestors a ON f.id = a.parent_id
                )
                SELECT owner_id AS "owner_id: Uuid",
                is_directory AS "is_directory!"
                FROM file 
                LEFT JOIN share_user AS su
                ON su.file_id = file.id AND su.user_id = ?
                LEFT JOIN share_link AS sl
                ON sl.file_id = file.id AND sl.id = ? AND (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP)
                AND (sl.password_hash IS NULL OR sl.password_hash = ?)
                WHERE file.id IN (SELECT id FROM ancestors) AND (owner_id = ? OR su.edit_permission OR sl.edit_permission)
                LIMIT 1
                "#,
                parent_id,
                uuid,
                link_id,
                link_password,
                uuid
            )
            .fetch_optional(db)
            .await?
            {
                Some(parent_file) => {
                    if !parent_file.is_directory {
                        return Err(AppError::UserError((
                            StatusCode::BAD_REQUEST,
                            "Parent file is not a directory".into(),
                        )));
                    }
                    if key_nonce.is_none() {
                        return Err(AppError::UserError((
                            StatusCode::BAD_REQUEST,
                            "A key nonce is required for files with a parent directory!".into(),
                        )));
                    }
                    parent_file.owner_id
                }
                None => {
                    return Err(AppError::UserError((
                        StatusCode::NOT_FOUND,
                        "Parent file not found!".into(),
                    )))
                }
            }
        }
        // This is a file in the root directory, so the owner
        // will automatically be the uploader
        None => *uuid
    };
    Ok(owner_id)
}

async fn check_space<'a, E>(
    metadata: &UploadMetadata,
    owner_id: &Uuid,
    file_size: i64,
    db: E,
) -> Result<(), AppError>
where
    E: Executor<'a, Database = Sqlite>,
{
    let owner = sqlx::query!(
        "SELECT total_space, used_space FROM user WHERE id = ?",
        owner_id
    )
    .fetch_one(db)
    .await?;
    let row_space = metadata.file_nonce.as_ref().map(|f| f.len()).unwrap_or(1)
        + metadata.key_nonce.as_ref().map(|k| k.len()).unwrap_or(1)
        + metadata.name_nonce.len()
        + metadata
            .mime_type_nonce
            .as_ref()
            .map(|m| m.len())
            .unwrap_or(1)
        + metadata.encrypted_key.len()
        + metadata.encrypted_file_name.len()
        + metadata
            .encrypted_mime_type
            .as_ref()
            .map(|e| e.len())
            .unwrap_or(1);
    if owner.used_space + row_space as i64 + file_size > owner.total_space {
        return Err(AppError::UserError((
            StatusCode::PAYMENT_REQUIRED,
            "File owner does not have enough free space".into(),
        )));
    }
    Ok(())
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkParams {
    pub link_id: Option<Uuid>,
}

#[utoipa::path(
    delete,
    path = "/api/file/{id}",
    description = "Delete a file. Recursively deletes all children if the file is a directory",
    params(
            LinkParams,
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
    user: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    Query(params): Query<LinkParams>,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    // Check if the user owns the file or has edit
    // access to the file. In the case of edit access,
    // only children are able to be deleted
    let uuid = user.map(|user| user.0.id);
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    if sqlx::query!(
        r#"
        WITH RECURSIVE ancestors AS (
            SELECT
                id,
                parent_id
            FROM file
            WHERE id = ?  -- the file we're checking
            UNION ALL
            SELECT
                f.id,
                f.parent_id
            FROM file f
            JOIN ancestors a ON f.id = a.parent_id
        )
        SELECT owner_id AS "owner_id: Uuid",
        is_directory AS "is_directory!"
        FROM file 
        LEFT JOIN share_user AS su
        ON su.file_id = file.id AND su.user_id = ?
        LEFT JOIN share_link AS sl
        ON sl.file_id = file.id AND sl.id = ? AND (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        AND (sl.password_hash IS NULL OR sl.password_hash = ?)
        WHERE file.id IN (SELECT id FROM ancestors) AND (
            owner_id = ? OR (
                -- Only allow the users that have share access to delete the file
                -- if it is a child of a directory being shared with them, not
                -- the file itself
                (su.edit_permission AND su.file_id != ?) OR 
                (sl.edit_permission AND sl.file_id != ?)
            )
        )
        LIMIT 1
        "#,
        id,
        uuid,
        params.link_id,
        link_password,
        uuid,
        id,
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .is_none() {
        // Return an error if the user have permission to delete the file
        // or the file doesn't exist
        // This is to prevent users from deleting files they don't own
        // or attempting to snoop on files they don't have access to
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    };

    // Get the children of the file for local deletion
    let descendant_files = sqlx::query!(
        r#"
        WITH RECURSIVE descendants AS (
            SELECT id, is_directory FROM file WHERE id = ?
            UNION ALL
            SELECT f.id, f.is_directory
            FROM file f
            JOIN descendants d ON f.parent_id = d.id
        )
        SELECT id AS "id: Uuid", is_directory AS "is_directory!" FROM descendants;
        "#,
        id
    )
    .fetch_all(&state.pool)
    .await?;

    // The user has permission to delete the file, so delete it and all of its
    // children recursively
    sqlx::query!(r#"DELETE FROM file WHERE id = ?"#, id)
        .execute(&state.pool)
        .await?;

    for file in descendant_files {
        // Only delete the file on the local file system if it is not a directory
        // This is because we don't actually store created directories on the file system
        if !file.is_directory {
            // If the file exists, delete it
            match remove_file(&*UPLOAD_DIR.join(file.id.to_string())).await {
                // A not found error likely means that the file was already deleted
                // so just ignore it.
                // Any other error likely means that there actually is a file
                // system error so log it. We don't want to return the error
                // because we want to try deleting all of the files locally
                // instead of short-circuiting. Either way, the files are deleted
                // in the database, so they are inaccessible to the user
                Err(e) if e.kind() != ErrorKind::NotFound => {
                    error!("Unable to delete file '{}': {}", file.id, e);
                }
                _ => {}
            }
        }
    }

    Ok((StatusCode::OK, success!("File deleted successfully")).into_response())
}

#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UpdateFile {
    /// Move the file to a new parent
    #[serde(rename_all = "camelCase")]
    Move {
        /// The new parent id of the file
        parent_id: Option<Uuid>,
        #[schema(
            example = "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc=",
            content_encoding = "base64"
        )]
        encrypted_key: String,
        /// The new nonce for the encryption key
        #[schema(example = "nonce", content_encoding = "base64")]
        key_nonce: Option<String>,
    },
    /// Rename the file
    #[serde(rename_all = "camelCase")]
    Rename {
        /// The new encrypted name of the file
        #[schema(
            example = "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc=",
            content_encoding = "base64"
        )]
        encrypted_name: String,
        /// The new nonce for the file name
        /// We use a new one for each name for security reasons
        #[schema(example = "nonce", content_encoding = "base64")]
        name_nonce: String,
    },
}

#[utoipa::path(
    put,
    path = "/api/file/{id}",
    description = "Update a file or directory. Can be used to move or rename a file",
    request_body(content = UpdateFile, content_type = "application/json"),
    params(
            LinkParams,
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
    user: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    Query(params): Query<LinkParams>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFile>,
) -> Result<Response, AppError> {
    let uuid = user.map(|user| user.0.id);
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    // Check if the user owns the file or has
    // permission to edit the file
    let Some(target) = sqlx::query!(
        r#"
        WITH RECURSIVE ancestors AS (
            SELECT
                id,
                parent_id
            FROM file
            WHERE id = ?  -- the file we're checking
            UNION ALL
            SELECT
                f.id,
                f.parent_id
            FROM file f
            JOIN ancestors a ON f.id = a.parent_id
        )
        SELECT owner_id AS "owner_id: Uuid",
        is_directory AS "is_directory!"
        FROM file 
        LEFT JOIN share_user AS su
        ON su.file_id = file.id AND su.user_id = ?
        LEFT JOIN share_link AS sl
        ON sl.file_id = file.id AND sl.id = ? AND (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        AND (sl.password_hash IS NULL OR sl.password_hash = ?)
        WHERE file.id IN (SELECT id FROM ancestors) AND (
            owner_id = ? OR (
                -- Only allow the users that have share access to update the file
                -- if it is a child of a directory being shared with them, not
                -- the file itself
                (su.edit_permission AND su.file_id != ?) OR 
                (sl.edit_permission AND sl.file_id != ?)
            )
        )
        LIMIT 1
        "#,
        id,
        uuid,
        params.link_id,
        link_password,
        uuid,
        id,
        id
    )
    .fetch_optional(&state.pool)
    .await? else {
        // Return an error if the user doen't own the file
        // or the file doesn't exist
        // This is to prevent users from updating files they don't own
        // or attempting to snoop on files they don't have access to
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "Unable to find file to update".into(),
        )));
    };

    match body {
        UpdateFile::Move {
            parent_id,
            encrypted_key,
            key_nonce,
        } => {
            if parent_id.is_some() != key_nonce.is_some() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "A new nonce is only needed if the file does not have a parent id".into(),
                )));
            }
            if let Some(nonce) = key_nonce.as_ref() {
                check_nonce!(
                    &nonce,
                    "The provided mime type nonce is not the correct length!"
                )?;
            }

            let key_length = general_purpose::STANDARD
                .decode_slice(&encrypted_key, &mut [0; ROOT_FILE_ENCRYPTED_KEY_LENGTH])
                .map_err(|_| {
                    AppError::UserError((
                        StatusCode::BAD_REQUEST,
                        "Incorrect encrypted key length".into(),
                    ))
                })?;

            if (parent_id.is_some() && key_length != CHILD_FILE_ENCRYPTED_KEY_LENGTH)
                || (parent_id.is_none() && key_length != ROOT_FILE_ENCRYPTED_KEY_LENGTH)
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Incorrect encrypted key length".into(),
                )));
            }
            // Make sure that the target parent file being has the same owner to
            // prevent tampering with the source file.
            // We also include a children query here to ensure that the
            // user is not attempting to move a parent directory into one
            // of its children, as that could cause a cycle.
            // For now we do not want to allow files to change owners, as this would mean that
            // we would need to check if the new owner has space for the children before being
            // able to approve the move.
            let (is_directory, owner_id) = match parent_id {
                Some(parent_id) => {
                    let Some(parent) = sqlx::query!(
                                r#"
                        WITH RECURSIVE ancestors AS (
                            SELECT
                                id,
                                parent_id
                            FROM file
                            WHERE id = ? -- the id of the parent file goes here
                            UNION ALL
                            SELECT
                                f.id,
                                f.parent_id
                            FROM file f
                            JOIN ancestors a ON f.id = a.parent_id
                        ),
                        children AS (
                            SELECT
                                id,
                                parent_id
                            FROM file
                            WHERE id = ? -- the id of the current file goes here
                            UNION ALL
                            SELECT
                                f.id,
                                f.parent_id
                            FROM file f
                            JOIN children c ON f.parent_id = c.id
                        )
                        SELECT owner_id AS "owner_id: Uuid",
                        is_directory AS "is_directory!"
                        FROM file 
                        LEFT JOIN share_user AS su
                        ON su.file_id = file.id AND su.user_id = ?
                        LEFT JOIN share_link AS sl
                        ON sl.file_id = file.id AND sl.id = ? AND (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP)
                        WHERE file.id IN (
                            SELECT id FROM ancestors
                            EXCEPT
                            SELECT id FROM children
                        )
                        AND 
                            -- Ensure that the user has permission to edit the file
                            (owner_id = ? OR su.edit_permission OR sl.edit_permission)
                        LIMIT 1
                        "#,
                        parent_id,
                        id,
                        uuid,
                        params.link_id,
                        uuid
                    )
                        .fetch_optional(&state.pool)
                    .await?
                    else {
                        return Err(AppError::UserError((
                            StatusCode::NOT_FOUND,
                            "Unable to move file".into(),
                        )));
                    };
                    (parent.is_directory, parent.owner_id)
                }
                // If the parent id is null, then we are moving the file to the root directory
                // We know that, in this case, root is a directory and the owner is the same as the
                // user moving the file
                None => (true, uuid),
            };

            if !is_directory {
                return Err(AppError::UserError((
                    StatusCode::FORBIDDEN,
                    "Cannot set file parent to non-directories".into(),
                )));
            }

            // Ensure that the owner of this file is the same
            // as the owner of the file being moved
            if owner_id != target.owner_id {
                return Err(AppError::UserError((
                    StatusCode::FORBIDDEN,
                    "Cannot move file to a different owner".into(),
                )));
            }

            // Update the parent id of the file
            sqlx::query!(
                "UPDATE file SET parent_id = ?, encrypted_key = ?, key_nonce = ? WHERE id = ?",
                parent_id,
                encrypted_key,
                key_nonce,
                id
            )
            .execute(&state.pool)
            .await?;
        }
        UpdateFile::Rename {
            encrypted_name,
            name_nonce,
        } => {
            check_nonce!(
                &name_nonce,
                "The provided name nonce is not the correct length!"
            )?;
            // Rename the file
            sqlx::query!(
                "UPDATE file SET encrypted_name = ?, name_nonce = ? WHERE id = ?",
                encrypted_name,
                name_nonce,
                id
            )
            .execute(&state.pool)
            .await?;
        }
    }

    Ok((StatusCode::OK, success!("File updated successfully")).into_response())
}

#[derive(Serialize, ToSchema)]
pub struct TransactionResponse {
    id: Uuid,
}

#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRequest {
    #[serde(flatten)]
    upload: UploadMetadata,
    /// The size of each chunk in bytes, excluding
    /// the last chunk which may be smaller
    chunk_size: i64,
    total_chunks: i64,
    /// The final expected size of the file after
    /// all encryption on all chunks is performed.
    /// This is likely calculated using
    /// (NONCE_LENGTH + 16) * TOTAL_CHUNKS + FILE_SIZE
    /// the 16 comes from AES-GCM authentication tag
    file_size: i64,
}

// Check if the metadata provided for the upload is valid
fn check_upload_metadata(metadata: &UploadMetadata, authenticated: bool) -> Result<(), AppError> {
    let key_length = general_purpose::STANDARD
        .decode_slice(
            &metadata.encrypted_key,
            &mut [0; ROOT_FILE_ENCRYPTED_KEY_LENGTH],
        )
        .map_err(|_| {
            AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Incorrect encrypted key length".into(),
            ))
        })?;

    if authenticated {
        if (metadata.parent_id.is_some() && key_length != CHILD_FILE_ENCRYPTED_KEY_LENGTH)
            || (metadata.parent_id.is_none() && key_length != ROOT_FILE_ENCRYPTED_KEY_LENGTH)
        {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Incorrect encrypted key length".into(),
            )));
        }
    } else if key_length != CHILD_FILE_ENCRYPTED_KEY_LENGTH {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Incorrect encrypted key length".into(),
        )));
    }

    check_nonce!(
        &metadata.name_nonce,
        "The provided name nonce is not the correct length!"
    )?;

    if let Some(nonce) = metadata.file_nonce.as_ref() {
        check_nonce!(&nonce, "The provided file nonce is not the correct length!")?;
    }

    if let Some(nonce) = metadata.mime_type_nonce.as_ref() {
        check_nonce!(
            &nonce,
            "The provided mime type nonce is not the correct length!"
        )?;
    }

    if let Some(nonce) = metadata.key_nonce.as_ref() {
        check_nonce!(&nonce, "The provided key nonce is not the correct length!")?;
    }

    if metadata.mime_type_nonce.is_some() != metadata.encrypted_mime_type.is_some() {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Only include mime type nonce if there is a mime type to encrypt".into(),
        )));
    }

    if metadata.is_directory == metadata.file_nonce.is_some() {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Include a file nonce only if the file is not a directory".into(),
        )));
    }
    Ok(())
}

pub const MIN_CHUNK_SIZE: u64 = 2u64.pow(19);

#[utoipa::path(
    post,
    path = "/api/upload/chunked",
    description = "Start a chunked upload transaction for a file.",
    request_body(content = TransactionRequest, content_type = "application/json"),
    params(
            LinkParams,
        ),
    responses(
        (status = CREATED, description = "Transaction successfully started", body = TransactionResponse),
        (status = FORBIDDEN, description = "File metadata is not able to be processed as a chunked upload", body = ErrorResponse),
        (status = BAD_REQUEST, description = "Provided file metadata is not valid", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn start_chunked_upload(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    Query(params): Query<LinkParams>,
    Json(metadata): Json<TransactionRequest>,
) -> Result<Response, AppError> {
    if !metadata
        .file_size
        .try_into()
        .is_ok_and(|s: u64| s >= MIN_CHUNK_SIZE && s <= MAX_FILE_SIZE)
    {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "The provided file is too small to be uploaded in chunks".into(),
        )));
    }
    if !metadata
        .chunk_size
        .try_into()
        .is_ok_and(|s: u64| s >= MIN_CHUNK_SIZE)
    {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "The provided chunk size is too small, please use a larger chunk size or upload your file using the regular upload endpoint".into(),
        )));
    }
    if metadata.total_chunks <= 0 {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "There must be at least one chunk to process for uploading".into(),
        )));
    }
    if metadata.upload.is_directory {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "Uploading directories in chunks is not supported".into(),
        )));
    }
    // If the size of all of the chunks added up is smaller or larger than the
    // expected file size, then we return an error
    if metadata.file_size <= metadata.chunk_size * (metadata.total_chunks - 1)
        || metadata.file_size > metadata.chunk_size * metadata.total_chunks
    {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "File size does not match provided chunk constraints".into(),
        )));
    }
    if metadata.upload.file_nonce.is_some() {
        return Err(AppError::UserError((
            StatusCode::FORBIDDEN,
            "Chunked uploads are identified by their lack of file nonces. Please include the file nonce at the start of each encrypted block".into(),
        )));
    }
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    let uuid = user.map(|u| u.0.id);

    check_upload_metadata(&metadata.upload, uuid.is_some())?;
    let response = metadata
        .retry_upload_transaction(
            &state,
            &uuid,
            &params,
            link_password.as_deref(),
            (),
            metadata.file_size,
        )
        .await?;

    create_dir_all(TRANSACTION_DIR.join(response.id.to_string())).await?;

    Ok((StatusCode::CREATED, Json(response)).into_response())
}

#[derive(Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct UploadParams {
    #[serde(flatten)]
    link: LinkParams,
    /// Whether to automatically finalize the upload transaction after the last chunk is uploaded
    #[serde(default)]
    auto_finalize: bool,
}

#[utoipa::path(
    post,
    path = "/api/upload/{transaction_id}/chunk/{chunk_id}",
    description = "Upload a file chunk to an active transaction that is being uploaded in chunks.",
    request_body(content = BinaryFile, description = "The file chunk to process"),
    params(
            UploadParams,
            ("transactionId" = Uuid, Path, description = "The id of the transaction to upload the chunk to"),
            ("chunkId" = i64, Path, description = "The id of the uploading chunk.
                This id should be between 0 and total_chunks - 1 and should
                correspond to the chunk's position in the final file."),
        ),
    responses(
        (status = NO_CONTENT, description = "Successfully added chunk to transaction.
            If auto_finalize was set but this was returned for the last chunk,
            then the transaction was not finalized, likely due to an error in the chunk size or file size"),
        (status = CREATED, description = "Successfully added chunk to transaction and finalized transaction"),
        (status = BAD_REQUEST, description = "Invalid chunk size", body = ErrorResponse),
    ),
    security(
        (),
        ("lokr_session_cookie" = []),
    )
)]
pub async fn upload_chunk(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    Path((transaction_id, chunk_id)): Path<(Uuid, i64)>,
    Query(params): Query<UploadParams>,
    body: Body,
) -> Result<Response, AppError> {
    let transaction_path = TRANSACTION_DIR.join(transaction_id.to_string());
    if !transaction_path.is_dir() {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "The provided tranction id is not valid".into(),
        )));
    }
    let mut tx = state.pool.begin().await?;
    let Some(metadata) = sqlx::query!(
        r#"SELECT chunk_size, expected_size,
        total_chunks, parent_id AS "parent_id: Uuid",
        key_nonce FROM upload_transaction WHERE id = ?"#,
        transaction_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "The provided tranction id is not valid".into(),
        )));
    };
    let link_password = params
        .link
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    let uuid = user.as_ref().map(|u| u.0.id);

    // Check if the user still has permissions to the file
    get_owner_from_parent(
        metadata.parent_id.as_ref(),
        metadata.key_nonce.as_deref(),
        &uuid,
        link_password.as_deref(),
        params.link.link_id.as_ref(),
        &mut *tx,
    )
    .await?;

    if chunk_id < 0 || chunk_id >= metadata.total_chunks {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "The provided chunk id is not valid".into(),
        )));
    }
    let mut stream = body.into_data_stream();
    let file_path = transaction_path.join(chunk_id.to_string());
    let file = match File::create_new(&file_path).await {
        Ok(k) => k,
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "This chunk has already been uploaded".into(),
            )));
        }
        Err(e) => return Err(e.into()),
    };
    let mut writer = BufWriter::new(file);
    let mut chunk_size = 0;
    let expected_chunk_size = metadata.chunk_size as usize;
    let result: Result<_, AppError> = async move {
        while let Some(frame) = stream.next().await {
            let frame = frame?;
            chunk_size += frame.len();
            if chunk_size > expected_chunk_size {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "The provided chunk is larger than the chunk size for the transaction".into(),
                )));
            }
            writer.write_all(&frame).await?;
        }
        writer.flush().await?;
        // Only the last chunk is allowed to be smaller than the chunk size
        // This is the case where the last chunk is smaller than the chunk size
        if chunk_id == metadata.total_chunks - 1 {
            if (metadata.total_chunks - 1) * metadata.chunk_size + chunk_size as i64
            != metadata.expected_size
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "The total size of the uploaded chunks does not match the expected file size"
                        .into(),
                )));
            }
        } else if chunk_size != expected_chunk_size {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Only the last chunk of a transaction is allowed to be smaller than the chunk size"
                    .into(),
            )));
        }

        let current_chunks = sqlx::query_scalar!(
            "UPDATE upload_transaction SET current_chunks = current_chunks + 1 WHERE id = ? RETURNING current_chunks",
            transaction_id
        )
            .fetch_one(&state.pool)
        .await?;

        if current_chunks != metadata.total_chunks - 1 || !params.auto_finalize {
            return Ok((StatusCode::NO_CONTENT).into_response());
        }
        // This is the last chunk for the file and the user wants
        // auto finalizing of uploads, so handle finalizing the upload
        match finalize_chunked_upload(State(state), user, TypedHeader(cookies),Path(transaction_id), Query(params.link)).await {
            // This is the case where the transaction was not finalized successfully
            // but the chunk was uploaded successfully
            Err(_) => Ok((StatusCode::NO_CONTENT).into_response()),
            // For every other case the transaction was finalized successfully
            k => k,
        }
    }.await;

    match result {
        Err(e) => {
            cleanup(Some(&file_path)).await;
            return Err(e);
        }
        o => o,
    }
}

#[utoipa::path(
    post,
    path = "/api/upload/finalize/{transaction_id}",
    description = "Finalize a chunked upload transaction for a file.",
    params(
            ("transactionId" = Uuid, Path, description = "The id of the transaction to finalize"),
        ),
    responses(
        (status = CREATED, description = "Transaction successfully finalized", body = UploadResponse),
        (status = FORBIDDEN, description = "File metadata is not able to be processed as a chunked upload", body = ErrorResponse),
        (status = BAD_REQUEST, description = "Provided file metadata is not valid", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn finalize_chunked_upload(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    Path(transaction_id): Path<Uuid>,
    Query(params): Query<LinkParams>,
) -> Result<Response, AppError> {
    let uuid = user.as_ref().map(|u| u.0.id);
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    // TODO: Check that the user has permission to actually finalize the upload and that all of
    // the necessary chunks are done uploading
    let file_id = Uuid::now_v7();
    let transaction_path = TRANSACTION_DIR.join(transaction_id.to_string());
    let file_path = UPLOAD_DIR.join(file_id.to_string());
    let file = File::create_new(&file_path).await?;
    let mut writer = BufWriter::with_capacity(64 * 1024, file);
    let Some(metadata) = sqlx::query!(
        r#"SELECT chunk_size, expected_size,
        total_chunks, current_chunks, parent_id AS "parent_id: Uuid",
        key_nonce FROM upload_transaction WHERE id = ?"#,
        transaction_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "The provided tranction id is not valid".into(),
        )));
    };
    if metadata.total_chunks != metadata.current_chunks {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "The upload transaction is missing chunks".into(),
        )));
    }
    let result: Result<_, AppError> = async {
        let response = retry_transaction_fn(|| async {
            let mut tx = state.pool.begin().await?;
            let Some(metadata) = sqlx::query!(
                r#"
                DELETE FROM upload_transaction WHERE id = ?
                RETURNING owner_id, uploader_id, parent_id AS "parent_id: Uuid",
                encrypted_key, encrypted_name, mime, key_nonce, mime_type_nonce,
                name_nonce, expected_size
                "#,
                transaction_id
            )
            .fetch_optional(&mut *tx)
            .await?
            else {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "The provided tranction id is not valid".into(),
                )));
            };
            // Check that the user has permission to finalize the upload
            get_owner_from_parent(
                metadata.parent_id.as_ref(),
                metadata.key_nonce.as_deref(),
                &uuid,
                link_password.as_deref(),
                params.link_id.as_ref(),
                &mut *tx,
            )
            .await?;
            sqlx::query!(
                r#"
                INSERT INTO file (id, owner_id, uploader_id, parent_id,
                encrypted_key, encrypted_name, mime,
                key_nonce, mime_type_nonce, name_nonce, size)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
                file_id,
                metadata.owner_id,
                uuid,
                metadata.parent_id,
                metadata.encrypted_key,
                metadata.encrypted_name,
                metadata.mime,
                metadata.key_nonce,
                metadata.mime_type_nonce,
                metadata.name_nonce,
                metadata.expected_size,
            )
            .execute(&mut *tx)
            .await?;

            let link: Option<ShareResponse> =
                if metadata.owner_id.is_none() && metadata.parent_id.is_none() {
                    // Create a share link without edit permissions so we don't have to deal with
                    // anonymous users filling up a bunch of space.
                    // Might add ability to password protect in the future, keeping things simple for now.
                    // Will probably prevent abuse in the future using some kind of captcha or cloudflare
                    Some(
                        share_with_link(&state, &mut *tx, file_id, uuid, 60 * 60 * 24, None, false)
                            .await?,
                    )
                } else {
                    None
                };

            // Everything went well, commit the transaction
            tx.commit().await?;

            Ok((
                StatusCode::OK,
                Json(UploadResponse {
                    id: file_id,
                    size: metadata.expected_size,
                    is_directory: false,
                    link,
                }),
            )
                .into_response())
        })
        .await?;

        // Handle assembling the chunked file
        for chunk in 0..metadata.total_chunks {
            let path = transaction_path.join(chunk.to_string());
            // Reading the file should not fail because it is guaranteed
            // to exist due to us checking that all of the corresponding chunks
            // have been uploaded and not allowing the upload up duplicate chunks
            let chunk_file = File::open(&path).await?;
            let mut reader = BufReader::with_capacity(64 * 1024, chunk_file);
            copy(&mut reader, &mut writer).await?;
        }
        Ok(response)
    }
    .await;
    match result {
        Ok(k) => {
            // Delete the transaction directory upon success
            let _ = remove_dir_all(&transaction_path).await;
            Ok(k)
        }
        Err(e) => {
            // Remove the file if it was created but finalizing
            // the transaction failed
            cleanup(Some(&file_path)).await;
            Err(e)
        }
    }
}

pub trait Processable {
    type FileId;
    type Success;

    fn process_upload_transaction(
        &self,
        state: &AppState,
        uuid: &Option<Uuid>,
        params: &LinkParams,
        link_password: Option<&str>,
        file_id: &Self::FileId,
        file_size: i64,
    ) -> impl Future<Output = Result<Self::Success, AppError>>;

    #[allow(async_fn_in_trait)]
    async fn retry_upload_transaction(
        &self,
        state: &AppState,
        uuid: &Option<Uuid>,
        params: &LinkParams,
        link_password: Option<&str>,
        file_id: Self::FileId,
        file_size: i64,
    ) -> Result<Self::Success, AppError> {
        retry_transaction_fn(|| {
            self.process_upload_transaction(state, uuid, params, link_password, &file_id, file_size)
        })
        .await
    }
}

impl Processable for UploadMetadata {
    type FileId = Uuid;
    type Success = Option<ShareResponse>;

    async fn process_upload_transaction(
        &self,
        state: &AppState,
        uuid: &Option<Uuid>,
        params: &LinkParams,
        link_password: Option<&str>,
        file_id: &Self::FileId,
        file_size: i64,
    ) -> Result<Self::Success, AppError> {
        // Begin a transaction to prevent a race condition across threads
        // that could allow a user to upload more than they are allowed to
        let mut tx = state.pool.begin().await?;

        let owner_id = get_owner_from_parent(
            self.parent_id.as_ref(),
            self.key_nonce.as_deref(),
            uuid,
            link_password,
            params.link_id.as_ref(),
            &mut *tx,
        )
        .await?;

        // Check if the owner has enough space to upload the file
        if let Some(owner_id) = owner_id {
            check_space(self, &owner_id, file_size, &mut *tx).await?;
        }

        match sqlx::query!(
            r#"
        INSERT INTO file (id, owner_id, uploader_id, parent_id,
        encrypted_key, encrypted_name, mime, file_nonce,
        key_nonce, mime_type_nonce, name_nonce, is_directory, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
            file_id,
            owner_id,
            uuid,
            self.parent_id,
            self.encrypted_key,
            self.encrypted_file_name,
            self.encrypted_mime_type,
            self.file_nonce,
            self.key_nonce,
            self.mime_type_nonce,
            self.name_nonce,
            self.is_directory,
            file_size,
        )
        .execute(&mut *tx)
        .await
        {
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

        // If the owner is None, then that means the owner is anonymous
        // in this case we should generate a share link instead of checking
        // for space.
        let link: Option<ShareResponse> = if owner_id.is_none() && self.parent_id.is_none() {
            // Create a share link without edit permissions so we don't have to deal with
            // anonymous users filling up a bunch of space.
            // Might add ability to password protect in the future, keeping things simple for now.
            // Will probably prevent abuse in the future using some kind of captcha or cloudflare
            Some(
                share_with_link(state, &mut *tx, *file_id, *uuid, 60 * 60 * 24, None, false)
                    .await?,
            )
        } else {
            None
        };

        // Everything went well, commit the transaction
        tx.commit().await?;

        Ok(link)
    }
}

impl Processable for TransactionRequest {
    type FileId = ();
    type Success = TransactionResponse;

    async fn process_upload_transaction(
        &self,
        state: &AppState,
        uuid: &Option<Uuid>,
        params: &LinkParams,
        link_password: Option<&str>,
        #[allow(unused)] file_id: &Self::FileId,
        #[allow(unused)] file_size: i64,
    ) -> Result<Self::Success, AppError> {
        let mut tx = state.pool.begin().await?;

        let owner_id = get_owner_from_parent(
            self.upload.parent_id.as_ref(),
            self.upload.key_nonce.as_deref(),
            uuid,
            link_password,
            params.link_id.as_ref(),
            &mut *tx,
        )
        .await?;

        // Check if the owner has enough space to upload the file
        if let Some(owner_id) = owner_id {
            check_space(&self.upload, &owner_id, self.file_size, &mut *tx).await?;
        }
        let transaction_id = Uuid::new_v4();

        match sqlx::query!(
            r#"
        INSERT INTO upload_transaction (id, owner_id, uploader_id, parent_id,
        encrypted_key, encrypted_name, mime, key_nonce, mime_type_nonce,
        name_nonce, expected_size, chunk_size, total_chunks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
            transaction_id,
            owner_id,
            uuid,
            self.upload.parent_id,
            self.upload.encrypted_key,
            self.upload.encrypted_file_name,
            self.upload.encrypted_mime_type,
            self.upload.key_nonce,
            self.upload.mime_type_nonce,
            self.upload.name_nonce,
            self.file_size,
            self.chunk_size,
            self.total_chunks,
        )
        .execute(&mut *tx)
        .await
        {
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
        Ok(TransactionResponse { id: transaction_id })
    }
}
