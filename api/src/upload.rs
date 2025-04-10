use std::{collections::HashMap, io::ErrorKind, path::PathBuf};

use axum::{
    extract::{Multipart, Path, Query, Request, State},
    http::{StatusCode, Uri},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use axum_extra::{headers::Cookie, TypedHeader};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_inline_default::serde_inline_default;
use sqlx::{Executor, Sqlite};
use tokio::{fs::File, io::AsyncWriteExt};
use tracing::{error, instrument};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    share::{share_with_link, ShareResponse},
    state::AppState,
    success,
    users::PublicUser,
    utils::{get_file_users, Normalize},
    SuccessResponse, UPLOAD_DIR,
};

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
    #[schema(example = "", content_media_type = "text/plain")]
    link_id: Option<String>,
}

#[utoipa::path(
    post,
    path = "/api/upload",
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
    // Allocate a megabyte buffer
    let mut file_data: Vec<u8> = Vec::with_capacity(1024 * 1024);
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());

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

    // Implement retry mechanism for the entire transaction
    const MAX_RETRIES: usize = 5;
    const BASE_RETRY_DELAY_MS: u64 = 50;

    let mut retries = 0;
    let link;

    loop {
        // Begin a new transaction for each attempt
        match process_upload_transaction(
            &state,
            &uuid,
            &params,
            &metadata,
            link_password.as_deref(),
            file_id,
            file_data.len() as i64,
        )
        .await
        {
            Ok(link_result) => {
                link = link_result;
                break;
            }
            Err(e) => {
                // Check if it's an SQLITE_BUSY error because if it is
                // then we need to retry. 517 is SQLITE_BUSY_SNAPSHOT
                // Reference: https://www.sqlite.org/rescode.html#busy_snapshot
                if let AppError::SqlxError(db_err) = &e {
                    if let Some(code) = db_err.as_database_error().and_then(|e| e.code()) {
                        if (code == "5" || code == "517") && retries < MAX_RETRIES {
                            retries += 1;
                            // Exponential backoff with jitter
                            let jitter = fastrand::u64(1..=50);
                            let delay = BASE_RETRY_DELAY_MS * (1 << retries) + jitter;
                            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                            continue;
                        }
                    }
                }
                return Err(e);
            }
        }
    }

    // If everything succeeds, write the file to disk (only if it's not a directory)
    if let Some(file_path) = file_path {
        if !metadata.is_directory && !file_data.is_empty() {
            let mut file = File::create(file_path).await?;
            file.write_all(&file_data).await?;
        }
    }

    Ok((
        StatusCode::OK,
        Json(UploadResponse {
            id: file_id,
            size: file_data.len() as i64,
            is_directory: metadata.is_directory,
            link,
        }),
    )
        .into_response())
}

// Extract the transaction logic into a separate function to enable proper retries
async fn process_upload_transaction(
    state: &AppState,
    uuid: &Option<Uuid>,
    params: &LinkParams,
    metadata: &UploadMetadata,
    link_password: Option<&str>,
    file_id: Uuid,
    file_size: i64,
) -> Result<Option<ShareResponse>, AppError> {
    // Begin a transaction to prevent a race condition across threads
    // that could allow a user to upload more than they are allowed to
    let mut tx = state.pool.begin().await?;

    // Get the owner id of the file so we can reuse it, as the file owner for children should
    // be the same as the the owner id of the parent
    let owner_id = match metadata.parent_id {
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
                params.link_id,
                link_password,
                uuid
            )
            .fetch_optional(&mut *tx)
            .await?
            {
                Some(parent_file) => {
                    if !parent_file.is_directory {
                        return Err(AppError::UserError((
                            StatusCode::BAD_REQUEST,
                            "Parent file is not a directory".into(),
                        )));
                    }
                    if metadata.key_nonce.is_none() {
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

    // Check if the owner has enough space to upload the file
    // If the owner is None, then that means the owner is anonymous
    // in this case we should generate a share link instead of checking
    // for space.
    let link: Option<ShareResponse> = match owner_id {
        Some(owner_id) => {
            let owner = sqlx::query!(
                "SELECT total_space, used_space FROM user WHERE id = ?",
                owner_id
            )
            .fetch_one(&mut *tx)
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
            None
        }
        None => {
            // Create a share link without edit permissions so we don't have to deal with
            // anonymous users filling up a bunch of space.
            // Might add ability to password protect in the future, keeping things simple for now.
            // Will probably prevent abuse in the future using some kind of captcha or cloudflare
            Some(share_with_link(state, &mut *tx, file_id, *uuid, 60 * 60 * 24, None, false).await?)
        }
    };

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
        metadata.parent_id,
        metadata.encrypted_key,
        metadata.encrypted_file_name,
        metadata.encrypted_mime_type,
        metadata.file_nonce,
        metadata.key_nonce,
        metadata.mime_type_nonce,
        metadata.name_nonce,
        metadata.is_directory,
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

    // Everything went well, commit the transaction
    tx.commit().await?;

    Ok(link)
}

#[derive(Debug, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct LinkParams {
    link_id: Option<Uuid>,
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
            match std::fs::remove_file(&*UPLOAD_DIR.join(file.id.to_string())) {
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

/// Check if a user owns a file
pub async fn is_owner<'a, E: Executor<'a, Database = Sqlite>>(
    db: E,
    user: &Uuid,
    file: &Uuid,
) -> Result<bool, AppError> {
    Ok(sqlx::query!(
        "SELECT owner_id FROM file WHERE id = ? AND owner_id = ?",
        file,
        user
    )
    .fetch_optional(db)
    .await?
    .is_some())
}

/// Metadata of a file or directory
#[derive(Serialize, ToSchema, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    /// The id of the file or directory
    pub id: Uuid,
    #[serde(flatten)]
    pub upload: UploadMetadata,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub owner_id: Option<Uuid>,
    pub uploader_id: Option<Uuid>,
    pub size: i64,
    /// Whether or not the user has edit permission to this file
    /// if this is not set then the file should inherit the edit permissions
    /// of the parent. This will not be sent when a user is querying their
    /// own files, as they will always have edit permissions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edit_permission: Option<bool>,
    /// The children of the directory.
    /// Only present if the file is a directory.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Uuid>,
}

#[derive(Deserialize, IntoParams, Debug)]
#[serde(rename_all = "camelCase")]
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
    /// Whether to include the ancestors of the
    /// chain of the file in the response
    #[serde(default)]
    pub include_ancestors: bool,
}

impl FileMetadata {
    fn example() -> HashMap<Uuid, Self> {
        let parent_uuid = Uuid::try_parse_ascii(b"123e4567-e89b-12d3-a456-426614174000").unwrap();
        let child_uuid = Uuid::try_parse_ascii(b"21f981a7-d21f-4aa5-9f6b-09005235236a").unwrap();
        let user_id = Uuid::try_parse_ascii(b"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86").unwrap();

        let date = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        let first = FileMetadata {
            id: parent_uuid,
            upload: UploadMetadata {
                encrypted_file_name: "encryptedFileName".into(),
                encrypted_mime_type: Some("encryptedMimeType".into()),
                encrypted_key: "encryptedKey".into(),
                file_nonce: Some("exampleNonce".into()),
                key_nonce: Some("exampleNonce".into()),
                name_nonce: "exampleNonce".into(),
                mime_type_nonce: Some("exampleNonce".into()),
                is_directory: true,
                parent_id: None,
            },
            size: 0,
            edit_permission: None,
            created_at: date,
            modified_at: date,
            owner_id: Some(user_id),
            uploader_id: Some(user_id),
            children: vec![child_uuid],
        };
        let child = FileMetadata {
            id: child_uuid,
            upload: UploadMetadata {
                encrypted_file_name: "encryptedFileName".into(),
                encrypted_mime_type: Some("encryptedMimeType".into()),
                encrypted_key: "encryptedKey".into(),
                file_nonce: Some("exampleNonce".into()),
                key_nonce: Some("exampleNonce".into()),
                name_nonce: "exampleNonce".into(),
                mime_type_nonce: Some("exampleNonce".into()),
                is_directory: false,
                parent_id: Some(parent_uuid),
            },
            size: 32,
            created_at: date,
            modified_at: date,
            owner_id: Some(user_id),
            uploader_id: Some(user_id),
            children: vec![],
            edit_permission: None,
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
    #[schema(example = "same kind of thing as files, but with `PublicUser` schema...")]
    pub users: HashMap<Uuid, PublicUser>,
    #[schema(example = "123e4567-e89b-12d3-a456-426614174000")]
    pub root: Vec<Uuid>,
}
#[utoipa::path(
    get,
    path = "/api/file",
    description = "Get the metadata of a file or directory. Also returns the children of a directory.",
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
    SessionAuth(user): SessionAuth,
    Query(params): Query<FileQuery>,
) -> Result<Response, AppError> {
    // Limit the depth to 20 to prevent infinite recursion
    let depth = params.depth.min(20);
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
                    uploader_id,
                    file_nonce, 
                    key_nonce, 
                    name_nonce, 
                    mime_type_nonce, 
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
                    f.uploader_id,
                    f.file_nonce, 
                    f.key_nonce, 
                    f.name_nonce, 
                    f.mime_type_nonce, 
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
                uploader_id AS "uploader_id: Uuid",
                file_nonce AS "file_nonce?", 
                key_nonce, 
                name_nonce, 
                mime_type_nonce AS "mime_type_nonce?", 
                is_directory AS "is_directory!",
                mime,
                IIF(size - 16 < 0, 0, size - 16) AS "size!: i64",
                created_at,
                modified_at
            FROM children ORDER BY depth ASC LIMIT ? OFFSET ?
            "#,
        user.id,
        params.id,
        params.id,
        depth,
        params.limit,
        params.offset
    )
    .fetch_all(&state.pool);
    // If the user has requested to include ancestors, we need to run a second query
    // We want to speed up computation, so if the user requests ancestors
    // then run the query to get them concurrently with the main query
    let (query, ancestors) = if params.include_ancestors && params.id.is_some() {
        let ancestor_query = sqlx::query!(
            r#"
            WITH RECURSIVE ancestors AS (
                -- Anchor member (root or specified node)
                SELECT 
                    0 AS depth,
                    id, 
                    parent_id, 
                    encrypted_name, 
                    encrypted_key, 
                    owner_id,
                    uploader_id,
                    file_nonce, 
                    key_nonce, 
                    name_nonce, 
                    mime_type_nonce, 
                    is_directory, 
                    mime,
                    created_at,
                    modified_at
                FROM file
                WHERE 
                owner_id = ? AND
                id = ?
                UNION ALL
                
                -- Recursive member
                SELECT 
                    a.depth + 1,
                    f.id, 
                    f.parent_id, 
                    f.encrypted_name, 
                    f.encrypted_key, 
                    f.owner_id,
                    f.uploader_id,
                    f.file_nonce, 
                    f.key_nonce, 
                    f.name_nonce, 
                    f.mime_type_nonce, 
                    f.is_directory, 
                    f.mime,
                    f.created_at,
                    f.modified_at
                FROM file f
                JOIN ancestors a ON f.id = a.parent_id
            )
            SELECT 
                depth AS "depth!: u32",
                id AS "id: Uuid",
                parent_id AS "parent_id: Uuid", 
                encrypted_name, 
                encrypted_key, 
                owner_id AS "owner_id: Uuid",
                uploader_id AS "uploader_id: Uuid",
                file_nonce AS "file_nonce?", 
                key_nonce, 
                name_nonce, 
                mime_type_nonce AS "mime_type_nonce?", 
                is_directory AS "is_directory!",
                mime,
                -- Ancestors are always directories so their size must
                -- be always be 0
                0 AS "size!: i64",
                created_at,
                modified_at
            FROM ancestors
            WHERE depth > 0
            ORDER BY depth DESC
        "#,
            user.id,
            params.id
        )
        .fetch_all(&state.pool);
        // Run both database queries concurrently
        let (query, ancestor_query) = tokio::try_join!(query, ancestor_query)?;
        let ancestors = ancestor_query.into_iter().map(|row| FileMetadata {
            id: row.id,
            created_at: row.created_at.and_utc(),
            modified_at: row.modified_at.and_utc(),
            owner_id: row.owner_id,
            uploader_id: row.uploader_id,
            upload: UploadMetadata {
                encrypted_file_name: row.encrypted_name,
                encrypted_mime_type: row.mime,
                encrypted_key: row.encrypted_key,
                file_nonce: row.file_nonce,
                is_directory: row.is_directory,
                parent_id: row.parent_id,
                key_nonce: row.key_nonce,
                name_nonce: row.name_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: None,
        });
        (query, Some(ancestors))
    } else {
        (query.await?, None)
    };
    // Convert the query result into a tree structure
    let (files, root) = ancestors
        .into_iter()
        .flatten()
        .chain(query.into_iter().map(|row| FileMetadata {
            id: row.id,
            created_at: row.created_at.and_utc(),
            modified_at: row.modified_at.and_utc(),
            owner_id: row.owner_id,
            uploader_id: row.uploader_id,
            upload: UploadMetadata {
                encrypted_file_name: row.encrypted_name,
                encrypted_mime_type: row.mime,
                encrypted_key: row.encrypted_key,
                file_nonce: row.file_nonce,
                is_directory: row.is_directory,
                parent_id: row.parent_id,
                key_nonce: row.key_nonce,
                name_nonce: row.name_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: None,
        }))
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
                users: get_file_users(&state.pool, &files).await?,
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
    description = "Get the raw contents of a file. Requires the password hash of a link in the cookies of the request if the link is password protected.",
    params(
            ("id" = Uuid, Path, description = "The id of the file to get"),
            ("linkId" = Option<Uuid>, Query, description = "The share link id to use for accessing the file if applicable")
        ),
    responses(
        (status = OK, description = "The file was retrieved successfully", content_type = "application/octet-stream"),
        (status = NOT_FOUND, description = "File was not found"),
    ),
)]
// Dummy function to avoid generate documentation for this path
#[allow(unused)]
async fn get_file() {}

#[instrument(err, skip(state))]
pub async fn serve_auth(
    State(state): State<AppState>,
    auth: Option<SessionAuth>,
    TypedHeader(cookies): TypedHeader<Cookie>,
    uri: Uri,
    Query(params): Query<LinkParams>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    if auth.is_none() && params.link_id.is_none() {
        return Err(AppError::UserError((
            StatusCode::UNAUTHORIZED,
            "No link or authorization provided".into(),
        )));
    }
    // I tried using the Path extractor to only get the file id out but
    // that didn't work because ServeDir doesn't use path params
    // so I just had to use this hack instead
    let path = uri.path();
    let last_segment = path.split('/').last().unwrap_or_default();
    let Ok(id) = Uuid::try_parse(last_segment) else {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Invalid file id".into(),
        )));
    };
    let uuid = auth.map(|user| user.0.id);
    let link_password = params
        .link_id
        .and_then(|l_id| cookies.get(&l_id.to_string()))
        .and_then(|password_hash| urlencoding::decode(password_hash).ok());
    let query = sqlx::query!(r#"
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
        SELECT is_directory
        FROM file 
        LEFT JOIN share_user AS su
        ON su.file_id = file.id AND su.user_id = ?
        LEFT JOIN share_link AS sl
        ON sl.file_id = file.id AND sl.id = ? AND (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        AND (sl.password_hash IS NULL OR sl.password_hash = ?)
        WHERE file.id IN (SELECT id FROM ancestors) AND
        owner_id = ? OR su.file_id IS NOT NULL OR sl.file_id IS NOT NULL
        LIMIT 1
        "#,
        id,
        uuid,
        params.link_id,
        link_password,
        uuid,
    ).fetch_optional(&state.pool).await?;

    if query.is_none() {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    }
    let response = next.run(request).await;
    Ok(response)
}
