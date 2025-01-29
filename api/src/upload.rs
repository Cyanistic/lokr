use std::io::ErrorKind;

use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::{fs::File, io::AsyncWriteExt};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success, SuccessResponse, DATA_DIR, UPLOAD_DIR,
};

/// All data for the uploaded file.
/// All encrypted fields are expected to be encrypted
/// by the provided key, except for the key itself
/// which is expected to be encrypted by the user's public key
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadMetadata {
    /// The encrypted name of the file to be uploaded
    #[schema(content_encoding = "base64")]
    encrypted_file_name: Box<str>,
    /// The encrypted mime type of the file to be uploaded
    /// Optional in case the mime type is not known
    #[schema(content_encoding = "base64")]
    encrypted_mime_type: Option<Box<str>>,
    /// The key used to encrypt the file
    /// Should be encrypted by the user's public key
    #[schema(content_encoding = "base64")]
    encrypted_key: Box<str>,
    /// The nonce for the file (not encrypted)
    #[schema(content_encoding = "base64")]
    nonce: Box<str>,
    /// Whether the file is a directory
    #[serde(default)]
    is_directory: bool,
    /// The direct parent id of the file
    /// Should be null if in the root directory
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
        ("lokr_session_cookie" = [])
    )
)]
pub async fn upload_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    mut data: Multipart,
) -> Result<Response, AppError> {
    let mut metadata: Option<UploadMetadata> = None;
    let uuid = Uuid::from_bytes(user.id);
    let file_id = Uuid::now_v7();
    let mut file: Option<File> = None;
    // Allocate a megabyte buffer
    let mut file_data: Vec<u8> = Vec::with_capacity(1024 * 1024);

    while let Some(mut field) = data.next_field().await? {
        match field.name() {
            Some("metadata") => {
                metadata = Some(serde_json::from_slice(&field.bytes().await?)?);
            }
            Some("file") => {
                file = Some(File::create(UPLOAD_DIR.join(file_id.to_string())).await?);

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
        let Some(mut file) = file else {
            return Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Missing file".into(),
            )));
        };
        file.write_all(&file_data).await?;
        file_data.len() as i64
    } else {
        0
    };
    sqlx::query!(
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
    .await?;

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
        match std::fs::remove_file(&*DATA_DIR.join(id.to_string())) {
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

#[utoipa::path(
    get,
    path = "/api/file/{id}",
    description = "Get the raw contents of a file or directory",
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
