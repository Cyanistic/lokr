use std::{collections::HashMap, time::Duration};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    PasswordHash, PasswordVerifier,
};
use axum::{
    extract::{Path, Query, State},
    http::{header::SET_COOKIE, StatusCode},
    response::{AppendHeaders, IntoResponse, Response},
    Json,
};
use axum_extra::{headers::Cookie, TypedHeader};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Sqlite};
use tracing::instrument;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success,
    upload::{is_owner, FileMetadata, FileQuery, FileResponse, UploadMetadata},
    users::PublicUser,
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
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ShareResponseType {
    #[serde(rename_all = "camelCase")]
    User { user_id: Uuid },
    #[serde(rename_all = "camelCase")]
    Link {
        link_id: Uuid,
        expires_at: Option<DateTime<Utc>>,
        password_protected: bool,
    },
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareResponse {
    #[serde(flatten)]
    pub type_: ShareResponseType,
    edit_permission: bool,
    created_at: DateTime<Utc>,
    modified_at: DateTime<Utc>,
}

#[utoipa::path(
    post,
    path = "/api/share",
    description = "Share a file with a user or generate a link",
    request_body(content = ShareRequest, description = "The file id and the type of sharing"),
    responses(
        (status = OK, description = "File or directory successfully shared with user", body = ShareResponse),
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
        } => Ok((
            StatusCode::OK,
            Json(
                share_with_user(&state, body.id, &encrypted_key, user.id, user_id, body.edit)
                    .await?,
            ),
        )
            .into_response()),
        ShareRequestType::Link { expires, password } => Ok((
            StatusCode::CREATED,
            Json(
                share_with_link(
                    &state,
                    &state.pool,
                    body.id,
                    Some(user.id),
                    expires,
                    password,
                    body.edit,
                )
                .await?,
            ),
        )
            .into_response()),
    }
}

/// Helper function for sharing a file with using a link
pub async fn share_with_link<'a, E: Executor<'a, Database = Sqlite>>(
    state: &AppState,
    db: E,
    file_id: Uuid,
    user: Option<Uuid>,
    expires: u64,
    password: Option<String>,
    edit: bool,
) -> Result<ShareResponse, AppError> {
    let link = Uuid::new_v4();
    let expires = (expires > 0).then(|| Utc::now() + Duration::from_secs(expires));
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
            if password.is_empty() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Password cannot be empty!".into(),
                )));
            }
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
    let row = sqlx::query!(
        r#"
        INSERT INTO share_link (id, file_id, expires_at, password_hash, edit_permission) VALUES (?, ?, ?, ?, ?)
        RETURNING created_at AS "created_at!", modified_at AS "modified_at!"
        "#,
        link,
        file_id,
        expires,
        password_hash,
        edit
    )
    .fetch_one(db)
    .await?;

    Ok(ShareResponse {
        type_: ShareResponseType::Link {
            link_id: link,
            expires_at: expires,
            password_protected: password_hash.is_some(),
        },
        edit_permission: edit,
        created_at: row.created_at.and_utc(),
        modified_at: row.modified_at.and_utc(),
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
) -> Result<ShareResponse, AppError> {
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
    let row = match sqlx::query!(
        r#"
        INSERT INTO share_user (file_id, user_id, encrypted_key, edit_permission) VALUES (?, ?, ?, ?) 
        ON CONFLICT DO UPDATE SET encrypted_key = ?
        RETURNING created_at AS "created_at!", modified_at AS "modified_at!"
        "#,
        file_id,
        receiver_id,
        encrypted_key,
        edit,
        encrypted_key
    )
    .fetch_one(&state.pool)
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
        Ok(k) => k
    };
    Ok(ShareResponse {
        type_: ShareResponseType::User {
            user_id: receiver_id,
        },
        edit_permission: edit,
        created_at: row.created_at.and_utc(),
        modified_at: row.modified_at.and_utc(),
    })
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
            file_id IN (SELECT id FROM ancestors);
            "#,
            params.id,
            user.id,
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
                    file_nonce, 
                    key_nonce, 
                    name_nonce, 
                    mime_type_nonce, 
                    owner_id,
                    uploader_id,
                    is_directory,
                    mime,
                    size,
                    file.created_at,
                    file.modified_at,
                    edit_permission
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
                    f.file_nonce, 
                    f.key_nonce, 
                    f.name_nonce, 
                    f.mime_type_nonce, 
                    f.owner_id,
                    f.uploader_id,
                    f.is_directory,
                    f.mime,
                    f.size,
                    f.created_at,
                    f.modified_at,
                    NULL as "edit_permission"
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
                file_nonce, 
                key_nonce, 
                name_nonce, 
                mime_type_nonce, 
                owner_id AS "owner_id: Uuid",
                uploader_id AS "uploader_id: Uuid",
                is_directory,
                mime,
                edit_permission AS "edit_permission?",
                IIF(size - 16 < 0, 0, size - 16) AS "size!: i64",
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
    .fetch_all(&state.pool);

    // If the user has requested to include ancestors, we need to run a second query
    // We want to speed up computation, so if the user requests ancestors
    // then run the query to get them concurrently with the main query
    let (query, ancestors) = if params.include_ancestors {
        let ancestor_query = sqlx::query!(
            r#"
            WITH RECURSIVE ancestors AS (
              -- Anchor member: start at the requested file.
              SELECT
                0 AS depth,
                f.id,
                -- If the file is directly shared (joined via share_user), hide its parent_id.
                IIF(su.file_id IS NOT NULL, NULL, f.parent_id) AS parent_id,
                f.encrypted_name,
                COALESCE(su.encrypted_key, f.encrypted_key) AS encrypted_key,
                f.file_nonce, 
                f.key_nonce, 
                f.name_nonce, 
                f.mime_type_nonce, 
                f.owner_id,
                f.uploader_id,
                f.is_directory,
                f.mime,
                f.created_at,
                f.modified_at,
                -- Mark whether this file is directly shared.
                IIF(su.file_id IS NOT NULL, 1, 0) AS directly_shared,
                edit_permission
              FROM file f
              LEFT JOIN share_user su
                ON f.id = su.file_id AND su.user_id = ?  -- parameter: current user's id
              WHERE f.id = ?                              -- parameter: requested file id
                AND (su.user_id IS NULL OR su.user_id = ?)
                AND f.owner_id != ?                       -- parameter: current user's id

              UNION ALL

              -- Recursive member: get ancestors only if the previous file was not directly shared.
              SELECT
                a.depth + 1 AS depth,
                f.id,
                IIF(su.file_id IS NOT NULL, NULL, f.parent_id) AS parent_id,
                f.encrypted_name,
                f.encrypted_key,
                f.file_nonce, 
                f.key_nonce, 
                f.name_nonce, 
                f.mime_type_nonce, 
                f.owner_id,
                f.uploader_id,
                f.is_directory,
                f.mime,
                f.created_at,
                f.modified_at,
                IIF(su.file_id IS NOT NULL, 1, 0) AS directly_shared,
                su.edit_permission
              FROM file f
              JOIN ancestors a ON f.id = a.parent_id
              LEFT JOIN share_user su
                ON f.id = su.file_id AND su.user_id = ?  -- parameter: current user's id again
              WHERE a.directly_shared = 0
            )
            SELECT 
                depth AS "depth!: u32",
                id AS "id: Uuid",
                parent_id AS "parent_id: Uuid", 
                encrypted_name, 
                encrypted_key, 
                owner_id AS "owner_id: Uuid",
                uploader_id AS "uploader_id: Uuid",
                file_nonce, 
                key_nonce, 
                name_nonce, 
                mime_type_nonce, 
                is_directory AS "is_directory!",
                mime,
                -- Ancestors are always directories so their size must
                -- be always be 0
                0 AS "size!: i64",
                edit_permission AS "edit_permission?",
                created_at,
                modified_at
            FROM ancestors
            WHERE depth > 0
            ORDER BY depth DESC
        "#,
            user.id,
            params.id,
            user.id,
            user.id,
            user.id
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
                name_nonce: row.name_nonce,
                key_nonce: row.key_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: row.edit_permission,
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
                name_nonce: row.name_nonce,
                key_nonce: row.key_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: row.edit_permission,
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
    TypedHeader(cookie): TypedHeader<Cookie>,
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
        file_id IN (SELECT id FROM ancestors);
        "#,
            params.id,
            link_id,
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
    let password = if let Some(stored_hash) =
        sqlx::query_scalar!("SELECT password_hash FROM share_link WHERE id = ?", link_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::UserError((
                StatusCode::NOT_FOUND,
                "Invalid share link".into(),
            )))? {
        // Attempt to read the password from the request body.
        // If the password is not provided, then check the cookie to see if
        // the user has already provided the correct password in the past.
        // If neither, then reject the request.
        let password = match (link_request, cookie.get(&link_id.to_string())) {
            (Some(password), _) if !password.is_empty() => password,
            (_, Some(password)) => urlencoding::decode(password)?.to_string(),
            (_, _) => return Err(AppError::UserError((
                StatusCode::UNAUTHORIZED,
                "This link requires a password. Please provide a password inside the request body"
                    .into(),
            ))),
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
        Some(password)
    } else {
        None
    };
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
                    file_nonce,
                    key_nonce,
                    name_nonce,
                    mime_type_nonce,
                    owner_id,
                    uploader_id,
                    is_directory,
                    mime,
                    size,
                    file.created_at,
                    file.modified_at,
                    edit_permission
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
                    f.file_nonce,
                    f.key_nonce,
                    f.name_nonce,
                    f.mime_type_nonce,
                    f.owner_id,
                    f.uploader_id,
                    f.is_directory,
                    f.mime,
                    f.size,
                    f.created_at,
                    f.modified_at,
                    NULL AS edit_permission
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
                file_nonce,
                key_nonce,
                name_nonce,
                mime_type_nonce,
                owner_id AS "owner_id: Uuid",
                uploader_id AS "uploader_id: Uuid",
                is_directory,
                mime,
                edit_permission AS "edit_permission?",
                IIF(size - 16 < 0, 0, size - 16) AS "size!: i64",
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
    .fetch_all(&state.pool);

    // If the user has requested to include ancestors, we need to run a second query
    // We want to speed up computation, so if the user requests ancestors
    // then run the query to get them concurrently with the main query
    let (query, ancestors) = if params.include_ancestors {
        let ancestor_query = sqlx::query!(
            r#"
                WITH RECURSIVE ancestors AS (
                -- Anchor: start from the requested file
                SELECT
                    0 AS depth,
                    f.id,
                    -- If this file is directly shared, do not leak its parent.
                    IIF(sl.file_id IS NOT NULL, NULL, f.parent_id) AS parent_id,
                    f.encrypted_name,
                    f.encrypted_key,
                    f.file_nonce,
                    f.key_nonce,
                    f.name_nonce,
                    f.mime_type_nonce,
                    f.owner_id,
                    f.uploader_id,
                    f.is_directory,
                    f.mime,
                    f.created_at,
                    f.modified_at,
                    IIF(sl.file_id IS NOT NULL, 1, 0) AS directly_shared,
                    edit_permission
                FROM file f
                LEFT JOIN share_link sl 
                    ON f.id = sl.file_id 
                    AND sl.id = ?                             -- Parameter: share_link id
                    AND (sl.expires_at IS NULL OR DATETIME(sl.expires_at) >= CURRENT_TIMESTAMP)
                WHERE f.id = ?                              -- Parameter: requested file id

                UNION ALL

                -- Recursive: walk upward only if the previous row was not directly shared.
                SELECT
                    a.depth + 1 AS depth,
                    f.id,
                    IIF(sl.file_id IS NOT NULL, NULL, f.parent_id) AS parent_id,
                    f.encrypted_name,
                    f.encrypted_key,
                    f.file_nonce,
                    f.key_nonce,
                    f.name_nonce,
                    f.mime_type_nonce,
                    f.owner_id,
                    f.uploader_id,
                    f.is_directory,
                    f.mime,
                    f.created_at,
                    f.modified_at,
                    IIF(sl.file_id IS NOT NULL, 1, 0) AS directly_shared,
                    sl.edit_permission AS edit_permission
                FROM file f
                JOIN ancestors a ON f.id = a.parent_id
                LEFT JOIN share_link sl 
                    ON f.id = sl.file_id 
                    AND sl.id = ?                             -- Parameter: share_link id (again)
                    AND (sl.expires_at IS NULL OR DATETIME(sl.expires_at) >= CURRENT_TIMESTAMP)
                WHERE a.directly_shared = 0
            )
            SELECT 
                depth AS "depth!: u32",
                id AS "id: Uuid",
                parent_id AS "parent_id: Uuid", 
                encrypted_name, 
                encrypted_key, 
                owner_id AS "owner_id: Uuid",
                uploader_id AS "uploader_id: Uuid",
                file_nonce,
                key_nonce,
                name_nonce,
                mime_type_nonce,
                is_directory AS "is_directory!",
                mime,
                -- Ancestors are always directories so their size must
                -- be always be 0
                0 AS "size!: i64",
                edit_permission AS "edit_permission?",
                created_at,
                modified_at
            FROM ancestors
            WHERE depth > 0
            ORDER BY depth DESC
        "#,
            link_id,
            params.id,
            link_id
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
                name_nonce: row.name_nonce,
                key_nonce: row.key_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: row.edit_permission,
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
                name_nonce: row.name_nonce,
                key_nonce: row.key_nonce,
                mime_type_nonce: row.mime_type_nonce,
            },
            size: row.size,
            children: Vec::new(),
            edit_permission: row.edit_permission,
        }))
        .normalize();

    Ok((
        StatusCode::OK,
        if let Some(password) = password {
            AppendHeaders(vec![(
                SET_COOKIE,
                format!("{link_id}={}; HttpOnly", urlencoding::encode(&password)),
            )])
        } else {
            AppendHeaders(vec![])
        },
        Json(FileResponse {
            users: get_file_users(&state.pool, &files).await?,
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
        (status = OK, description = "Links successfully retrieved", body = [ShareResponse]),
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
    let query: Vec<ShareResponse> = sqlx::query!(
        r#"
        SELECT share_link.id AS "link_id: Uuid", 
        expires_at AS "expires_at",
        edit_permission,
        (password_hash IS NOT NULL) AS "password_protected!: bool",
        created_at AS "created_at!", modified_at AS "modified_at!"
        FROM share_link 
        WHERE file_id = ? AND
        (expires_at IS NULL OR
        DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        "#,
        file_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| ShareResponse {
        type_: ShareResponseType::Link {
            link_id: row.link_id,
            expires_at: row.expires_at.map(|e| e.and_utc()),
            password_protected: row.password_protected,
        },
        edit_permission: row.edit_permission,
        created_at: row.created_at.and_utc(),
        modified_at: row.modified_at.and_utc(),
    })
    .collect();
    Ok((StatusCode::OK, Json(query)).into_response())
}

#[derive(Serialize, ToSchema)]
struct UserShareResponse {
    access: Vec<ShareResponse>,
    users: HashMap<Uuid, PublicUser>,
}

#[utoipa::path(
    get,
    path = "/api/shared/{file_id}/users",
    description = "Get a list of users that have permissions to a file",
    params(("file_id" = Uuid, Path, description = "The id of the file")),
    responses(
        (status = OK, description = "Users successfully retrieved", body = UserShareResponse),
        (status = BAD_REQUEST, description = "Invalid query params", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn get_shared_users(
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
    let (access, users): (Vec<ShareResponse>, HashMap<Uuid, PublicUser>) = sqlx::query!(
        r#"
        SELECT su.user_id AS "user_id: Uuid", 
        edit_permission,
        su.created_at AS "su_created_at!",
        su.modified_at AS "su_modified_at!",
        username, email, public_key,
        NULL AS "password_salt?: String", 
        avatar AS "avatar_extension"
        FROM share_user su
        JOIN user u ON u.id = su.user_id
        WHERE file_id = ?
        "#,
        file_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .fold(
        (Vec::new(), HashMap::new()),
        |(mut access, mut users), row| {
            access.push(ShareResponse {
                type_: ShareResponseType::User {
                    user_id: row.user_id,
                },
                edit_permission: row.edit_permission,
                created_at: row.su_created_at.and_utc(),
                modified_at: row.su_modified_at.and_utc(),
            });
            users.insert(
                row.user_id,
                PublicUser {
                    id: row.user_id,
                    username: row.username,
                    email: row.email,
                    public_key: row.public_key,
                    avatar_extension: row.avatar_extension,
                    password_salt: row.password_salt,
                },
            );
            (access, users)
        },
    );
    Ok((StatusCode::OK, Json(UserShareResponse { access, users })).into_response())
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ShareIdentifier {
    #[serde(rename_all = "camelCase")]
    User { user_id: Uuid, file_id: Uuid },
    #[serde(rename_all = "camelCase")]
    Link {
        link_id: Uuid,
        /// If this is NULL, this is assumed to not be changing.
        /// An empty string means remove the password
        password: Option<String>,
    },
}

#[utoipa::path(
    delete,
    path = "/api/shared",
    description = "Delete an active share link or revoke user permissions for a file",
    request_body(content = ShareIdentifier, description = "The type of file sharing being used"),
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
    Json(req): Json<ShareIdentifier>,
) -> Result<Response, AppError> {
    match req {
        ShareIdentifier::User { user_id, file_id } => {
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
        ShareIdentifier::Link { link_id, .. } => {
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct ShareUpdateRequest {
    #[serde(flatten)]
    type_: ShareIdentifier,
    edit: bool,
}

#[utoipa::path(
    put,
    path = "/api/share",
    description = "Update permissions for a directly shared file or link.",
    request_body(content = ShareUpdateRequest, description = "The type of file sharing being used"),
    responses(
        (status = OK, description = "Successfully updated file permissions", body = SuccessResponse),
        (status = BAD_REQUEST, description = "Invalid request body", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn update_share_permission(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(req): Json<ShareUpdateRequest>,
) -> Result<Response, AppError> {
    match req.type_ {
        // Using nested queries in both cases to avoid
        // call overhead of multiple queries
        ShareIdentifier::User { user_id, file_id } => {
            let rows = sqlx::query!(
                "
                UPDATE share_user SET edit_permission = ? FROM
                (SELECT id FROM file WHERE owner_id = ? AND id = ?) AS s
                WHERE user_id = ? AND file_id = s.id
                ",
                req.edit,
                user.id,
                file_id,
                user_id,
            )
            .execute(&state.pool)
            .await?
            .rows_affected();
            if rows == 0 {
                return Err(AppError::UserError((
                    StatusCode::FORBIDDEN,
                    "You do not have permission to update permissions".into(),
                )));
            }
        }
        ShareIdentifier::Link { link_id, password } => {
            // Only hash the password if it is provided and not
            // empty, as empty values mean that the user wants to
            // disable the password and None values mean that the
            // user does not want to modify the password.
            let password_hash = match password {
                Some(password) if !password.is_empty() => {
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
                p => p,
            };
            let rows = sqlx::query!(
                "UPDATE share_link SET edit_permission = ?,
                password_hash =  
                CASE ?
                    WHEN NULL THEN password_hash
                    WHEN '' THEN NULL
                    ELSE ?
                END
                FROM
                (SELECT share_link.id FROM file
                JOIN share_link ON share_link.file_id = file.id
                WHERE owner_id = ? AND share_link.id = ?) AS f
                WHERE share_link.id = f.id",
                req.edit,
                password_hash,
                password_hash,
                user.id,
                link_id
            )
            .execute(&state.pool)
            .await?
            .rows_affected();
            if rows == 0 {
                return Err(AppError::UserError((
                    StatusCode::FORBIDDEN,
                    "You do not have permission to update permissions".into(),
                )));
            }
        }
    }
    Ok((StatusCode::OK, success!("Successfully updated permissions")).into_response())
}

#[utoipa::path(
    get,
    path = "/api/shared/{link_id}",
    description = "Get information on an active link",
    responses(
        (status = OK, description = " Successfully retrieved link information", body = SuccessResponse),
        (status = BAD_REQUEST, description = "Invalid link", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn get_link_info(
    State(state): State<AppState>,
    Path(link_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let Some(link) = sqlx::query!(
        r#"
        SELECT id AS "id: Uuid", expires_at,
        password_hash IS NOT NULL AS "password_protected!: bool",
        edit_permission, created_at AS "created_at!", modified_at AS "modified_at!"
        FROM share_link WHERE id = ?
        "#,
        link_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "Link does not exist".into(),
        )));
    };
    Ok((
        StatusCode::OK,
        Json(ShareResponse {
            type_: ShareResponseType::Link {
                link_id: link.id,
                expires_at: link.expires_at.map(|time| time.and_utc()),
                password_protected: link.password_protected,
            },
            edit_permission: link.edit_permission,
            created_at: link.created_at.and_utc(),
            modified_at: link.modified_at.and_utc(),
        }),
    )
        .into_response())
}
