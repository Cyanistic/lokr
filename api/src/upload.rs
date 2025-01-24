use std::{io::ErrorKind, path::PathBuf};

use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::{fs::File, io::AsyncWriteExt};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    utils::data_dir,
};

/// All data for the uploaded file
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
}

/// The file size and id of the uploaded file
#[derive(Serialize, ToSchema)]
pub struct UploadResponse {
    id: Uuid,
    size: i64,
}

#[derive(ToSchema)]
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
)]
pub async fn upload_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    mut data: Multipart,
) -> Result<Response, AppError> {
    let mut metadata: Option<UploadMetadata> = None;
    let uuid = Uuid::from_bytes(user.id);
    let user_dir = get_user_dir(&uuid.to_string());
    if !user_dir.exists() {
        match std::fs::create_dir_all(&user_dir) {
            Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
            _ => {}
        }
    }
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
                file = Some(File::create(user_dir.join(file_id.to_string())).await?);

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
    let Some(mut file) = file else {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Missing file".into(),
        )));
    };
    let file_size = file_data.len() as i64;
    file.write_all(&file_data).await?;
    sqlx::query!(
        "INSERT INTO file (id, owner_id, encrypted_key, name, mime, nonce, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
        file_id,
        uuid,
        metadata.encrypted_key,
        metadata.encrypted_file_name,
        metadata.encrypted_mime_type,
        metadata.nonce,
        file_size,
    )
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::OK,
        Json(UploadResponse {
            id: file_id,
            size: file_size,
        }),
    )
        .into_response())
}

#[inline]
fn get_user_dir(user: &str) -> PathBuf {
    data_dir().join("uploads").join(user)
}
