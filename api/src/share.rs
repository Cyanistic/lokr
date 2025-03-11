use std::time::Duration;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    PasswordHash, PasswordVerifier,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success,
    upload::{is_owner, FileMetadata, FileQuery, FileResponse, UploadMetadata},
    utils::{get_file_users, Normalize},
    SuccessResponse,
};

/// An enum representing the type of sharing
#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ShareRequestType {
    #[serde(rename_all = "camelCase")]
    User {
        user_id: Uuid,
        encrypted_key: String,
    },
    Link {
        expires: u64,
        password: Option<String>,
    },
}

/// A request to share a file with a user or generate a link
#[derive(Deserialize, ToSchema, Debug)]
pub struct ShareRequest {
    #[serde(flatten)]
    type_: ShareRequestType,
    id: Uuid,
    /// Whether the user/link should have editing permissions
    edit: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareResponse {
    link: Uuid,
    expires_at: Option<DateTime<Utc>>,
}

#[utoipa::path(
    post,
    path = "/api/share",
    description = "Share a file with a user or generate a link",
    request_body(content = ShareRequest, description = "The file id and the type of sharing"),
    responses(
        (status = OK, description = "File or directory successfully shared with user", body = SuccessResponse),
        (status = CREATED, description = "File or directory share link successfully created", body = ShareResponse),
        (status = BAD_REQUEST, description = "File id was not provided", body = ErrorResponse),
        (status = NOT_FOUND, description = "File was not found", body = ErrorResponse),
    ),
)]
#[instrument(err, skip(state))]
pub async fn share_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(body): Json<ShareRequest>,
) -> Result<Response, AppError> {
    match body.type_ {
        ShareRequestType::User {
            user_id,
            encrypted_key,
        } => {
            share_with_user(&state, body.id, &encrypted_key, user.id, user_id, body.edit).await?;
            Ok((StatusCode::OK, success!("File shared with user")).into_response())
        }
        ShareRequestType::Link { expires, password } => Ok((
            StatusCode::CREATED,
            Json(
                share_with_link(&state, body.id, Some(user.id), expires, password, body.edit)
                    .await?,
            ),
        )
            .into_response()),
    }
}

/// Helper function for sharing a file with using a link
pub async fn share_with_link(
    state: &AppState,
    file_id: Uuid,
    user: Option<Uuid>,
    expires: u64,
    password: Option<String>,
    edit: bool,
) -> Result<ShareResponse, AppError> {
    let link = Uuid::new_v4();
    let expires = if expires > 0 {
        Some(Utc::now() + Duration::from_secs(expires))
    } else {
        None
    };

    // Check if the user owns the file
    // If the no user is provided, the file must be an anonymous file
    // which can be shared with a one-time link
    if let Some(user) = user {
        if !is_owner(&state.pool, &user, &file_id).await? {
            return Err(AppError::UserError((
                StatusCode::NOT_FOUND,
                "File not found".into(),
            )));
        }
    }

    let password_hash = match &password {
        Some(password) => {
            let salt = SaltString::generate(&mut OsRng);
            Some(
                tokio::task::block_in_place(|| {
                    state
                        .argon2
                        .hash_password(password.as_bytes(), &salt)
                        .map_err(|_| {
                            AppError::UserError((
                                StatusCode::BAD_REQUEST,
                                "Unable to hash password".into(),
                            ))
                        })
                })?
                .to_string(),
            )
        }
        None => None,
    };

    // Everything is good so insert the link
    sqlx::query!(
        "INSERT INTO share_link (id, file_id, expires_at, password_hash, edit_permission) VALUES (?, ?, ?, ?, ?)",
        link,
        file_id,
        expires,
        password_hash,
        edit
    )
    .execute(&state.pool)
    .await?;

    Ok(ShareResponse {
        link,
        expires_at: expires,
    })
}

/// Helper function for sharing a file directly with a user
pub async fn share_with_user(
    state: &AppState,
    file_id: Uuid,
    encrypted_key: &str,
    owner_id: Uuid,
    receiver_id: Uuid,
    edit: bool,
) -> Result<(), AppError> {
    if receiver_id == owner_id {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Cannot share file with owner".into(),
        )));
    }
    if !is_owner(&state.pool, &owner_id, &file_id).await? {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    }
    match sqlx::query!(
        "INSERT INTO share_user (file_id, user_id, encrypted_key, edit_permission) VALUES (?, ?, ?, ?)",
        file_id,
        receiver_id,
        encrypted_key,
        edit
    )
    .execute(&state.pool)
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
                "Invalid sharee id".into(),
            )))
        }
        Err(e) => return Err(e.into()),
        _ => {}
    }
    Ok(())
}

#[utoipa::path(
    get,
    path = "/api/shared",
    description = "Get files shared with the user",
    params(FileQuery),
    responses(
        (status = OK, description = "File successfully retrieved", body = FileResponse),
        (status = BAD_REQUEST, description = "Invalid query params", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn get_user_shared_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Query(params): Query<FileQuery>,
) -> Result<Response, AppError> {
    let depth = params.depth.min(20);
    // Check if the user has access to the file
    if params.id.is_some() {
        let access_query = sqlx::query_scalar!(
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
        SELECT COUNT(*)
        FROM share_user
        WHERE user_id = ? AND
        (? IS NULL OR file_id IN (SELECT id FROM ancestors));
        "#,
            params.id,
            user.id,
            params.id
        )
        .fetch_one(&state.pool)
        .await?;
        // If the result is 0, then the user does not have access to the file
        if access_query == 0 {
            return Err(AppError::UserError((
                StatusCode::NOT_FOUND,
                "File not found".into(),
            )));
        }
    }
    // The query to get the shared files
    let query = sqlx::query!(
        r#"
            WITH RECURSIVE children AS (
                -- Anchor member (root or specified node)
                SELECT
                    0 AS depth,
                    id,
                    -- Use IFF to only show the parent id if the file is not directly shared with the user
                    -- This is because files that are directly shared with the user will likely have a parent id
                    -- that is not shared with the user, therefore leaking info the user should not have access to
                    IIF(id = share_user.file_id, NULL, parent_id) AS parent_id,
                    encrypted_name,
                    -- If the file is directly shared with the user, then the user need to use their own key to decrypt it
                    -- so use that key instead of the file's key if it exists, otherwise we know the file is not directly shared
                    -- with the user so we can use the file's key since the user can decrypt it using the ancestor's key
                    COALESCE(share_user.encrypted_key, file.encrypted_key) AS encrypted_key,
                    nonce,
                    owner_id,
                    is_directory,
                    mime,
                    size,
                    file.created_at,
                    modified_at
                FROM file
                LEFT JOIN share_user ON file.id = share_user.file_id
                WHERE
                    -- Don't show files that are shared with other users
                    (user_id IS NULL OR user_id = ?) AND 
                    -- Don't show files owned by the user, as they aren't shared
                    owner_id != ? AND
                    -- If no file id is provided, then show the root directory
                    -- We need to use COALESCE to ensure that only files in root directory
                    -- are shown if the file id is NULL. We can idenfify shared files in the root directory
                    -- by checking if the file is directly shared with the user
                    id = COALESCE(?, share_user.file_id)
                UNION ALL

                -- Recursive member
                SELECT
                    c.depth + 1,
                    f.id,
                    f.parent_id,
                    f.encrypted_name,
                    f.encrypted_key,
                    f.nonce,
                    f.owner_id,
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
                nonce,
                owner_id AS "owner_id: Uuid",
                is_directory,
                mime,
                size,
                created_at,
                modified_at
            FROM children ORDER BY depth ASC LIMIT ? OFFSET ?
    "#,
        user.id,
        user.id,
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
                users: Some(get_file_users(&state.pool, &files).await?),
                files,
                root,
            }),
        )
            .into_response())
    }
}

#[utoipa::path(
    post,
    path = "/api/shared/{link_id}",
    description = "Get files shared with the user. This is a POST request because the password is sent in the body, GET requests should not have a body.",
    params(FileQuery, ("link_id" = Uuid, Path, description = "The id of the share link")),
    request_body(content = Option<String>, description = "The password for the shared link", example = "amogus"),
    responses(
        (status = OK, description = "Files successfully retrieved", body = FileResponse),
        (status = BAD_REQUEST, description = "Invalid query params", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ()
    )
)]
#[instrument(err, skip(state, link_request))]
pub async fn get_link_shared_file(
    State(state): State<AppState>,
    Query(params): Query<FileQuery>,
    Path(link_id): Path<Uuid>,
    Json(link_request): Json<Option<String>>,
) -> Result<Response, AppError> {
    let depth = params.depth.min(20);
    // Check if the user has access to the file
    if params.id.is_some() {
        let access_query = sqlx::query_scalar!(
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
        SELECT COUNT(*)
        FROM share_link
        WHERE share_link.id = ? AND
        (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP) AND
        (? IS NULL OR file_id IN (SELECT id FROM ancestors));
        "#,
            params.id,
            link_id,
            params.id
        )
        .fetch_one(&state.pool)
        .await?;
        // If the result is 0, then the user does not have access to the file
        if access_query == 0 {
            return Err(AppError::UserError((
                StatusCode::NOT_FOUND,
                "File not found".into(),
            )));
        }
    }

    // Check if the password is correct
    if let Some(stored_hash) =
        sqlx::query_scalar!("SELECT password_hash FROM share_link WHERE id = ?", link_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::UserError((
                StatusCode::NOT_FOUND,
                "Invalid share link".into(),
            )))?
    {
        let Some(password) = link_request else {
            return Err(AppError::UserError((
                StatusCode::UNAUTHORIZED,
                "This link requires a password. Please provide a password inside the request body"
                    .into(),
            )));
        };
        tokio::task::block_in_place(|| {
            state
                .argon2
                .verify_password(
                    password.as_bytes(),
                    &PasswordHash::new(&stored_hash).expect("Password hash should be valid"),
                )
                .map_err(|_| {
                    AppError::UserError((StatusCode::UNAUTHORIZED, "Invalid password".into()))
                })
        })?;
    }
    // The query to get the shared files
    let query = sqlx::query!(
        r#"
            WITH RECURSIVE children AS (
                -- Anchor member (root or specified node)
                SELECT
                    0 AS depth,
                    file.id,
                    -- Use IFF to only show the parent id if the file is not directly shared with the user
                    -- This is because files that are directly shared with the user will likely have a parent id
                    -- that is not shared with the user, therefore leaking info the user should not have access to
                    IIF(file.id = share_link.file_id, NULL, parent_id) AS parent_id,
                    encrypted_name,
                    encrypted_key,
                    nonce,
                    owner_id,
                    is_directory,
                    mime,
                    size,
                    file.created_at,
                    modified_at
                FROM file
                LEFT JOIN share_link ON file.id = share_link.file_id
                WHERE
                    -- Don't show files that are shared with other links
                    (share_link.id IS NULL OR share_link.id = ?) AND 
                    (expires_at IS NULL OR DATETIME(expires_at) >= CURRENT_TIMESTAMP) AND
                    -- If no file id is provided, then show the root directory
                    -- We need to use COALESCE to ensure that only files in root directory
                    -- are shown if the file id is NULL. We can idenfify shared files in the root directory
                    -- by checking if the file is directly shared with the user
                    file.id = COALESCE(?, share_link.file_id)
                UNION ALL

                -- Recursive member
                SELECT
                    c.depth + 1,
                    f.id,
                    f.parent_id,
                    f.encrypted_name,
                    f.encrypted_key,
                    f.nonce,
                    f.owner_id,
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
                nonce,
                owner_id AS "owner_id: Uuid",
                is_directory,
                mime,
                size,
                created_at,
                modified_at
            FROM children ORDER BY depth ASC LIMIT ? OFFSET ?
    "#,
        link_id,
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

    Ok((
        StatusCode::OK,
        Json(FileResponse {
            users: Some(get_file_users(&state.pool, &files).await?),
            files,
            root,
        }),
    )
        .into_response())
}

#[utoipa::path(
    get,
    path = "/api/shared/{file_id}/links",
    description = "Get active links for a file",
    params(("file_id" = Uuid, Path, description = "The id of the file")),
    responses(
        (status = OK, description = "Links successfully retrieved", body = ShareResponse),
        (status = BAD_REQUEST, description = "Invalid query params", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn get_shared_links(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(file_id): Path<Uuid>,
) -> Result<Response, AppError> {
    if !is_owner(&state.pool, &user.id, &file_id).await? {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    }
    let query = sqlx::query_as!(
        ShareResponse,
        r#"
        SELECT share_link.id AS "link: Uuid", expires_at AS "expires_at: _"
        FROM share_link 
        WHERE file_id = ? AND
        (expires_at IS NULL OR
        DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        "#,
        file_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok((StatusCode::OK, Json(query)).into_response())
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ShareDeleteType {
    #[serde(rename_all = "camelCase")]
    User { user_id: Uuid, file_id: Uuid },
    #[serde(rename_all = "camelCase")]
    Link { link_id: Uuid },
}

#[utoipa::path(
    delete,
    path = "/api/shared",
    description = "Delete an active share link or revoke user permissions for a file",
    request_body(content = ShareDeleteType, description = "The type of file sharing being used"),
    responses(
        (status = OK, description = " Successfully deleted/revoked file permissions", body = SuccessResponse),
        (status = BAD_REQUEST, description = "Invalid request body", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn delete_share_permission(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(req): Json<ShareDeleteType>,
) -> Result<Response, AppError> {
    match req {
        ShareDeleteType::User { user_id, file_id } => {
            let rows = sqlx::query!(
                "
                DELETE FROM share_user WHERE user_id = ? AND
                file_id IN (SELECT id FROM file WHERE id = ? AND owner_id = ?)
                ",
                user_id,
                file_id,
                user.id
            )
            .execute(&state.pool)
            .await?
            .rows_affected();
            if rows == 0 {
                return Err(AppError::UserError((
                    StatusCode::NOT_FOUND,
                    "File is not shared with user".into(),
                )));
            }
            Ok((
                StatusCode::OK,
                success!("File permissions successfully revoked"),
            )
                .into_response())
        }
        ShareDeleteType::Link { link_id } => {
            let rows = sqlx::query!(
                r#"
                DELETE FROM share_link
                WHERE id IN (
                    SELECT share_link.id FROM share_link
                    JOIN file ON file.id = share_link.file_id
                    WHERE share_link.id = ? AND owner_id = ?
                )
                "#,
                link_id,
                user.id
            )
            .execute(&state.pool)
            .await?
            .rows_affected();
            if rows == 0 {
                return Err(AppError::UserError((
                    StatusCode::NOT_FOUND,
                    "Link not found".into(),
                )));
            }
            Ok((StatusCode::OK, success!("Link successfully deleted")).into_response())
        }
    }
}
