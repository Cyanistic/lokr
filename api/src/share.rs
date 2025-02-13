use std::time::Duration;

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success,
    upload::{is_owner, FileMetadata, FileQuery, UploadMetadata},
    utils::Hierarchify,
    SuccessResponse,
};

/// An enum representing the type of sharing
#[derive(Deserialize, ToSchema)]
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
#[derive(Deserialize, ToSchema)]
pub struct ShareRequest {
    #[serde(flatten)]
    type_: ShareRequestType,
    id: Uuid,
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
            share_with_user(&state, body.id, &encrypted_key, user.id, user_id).await?;
            Ok((StatusCode::OK, success!("File shared with user")).into_response())
        }
        ShareRequestType::Link { expires, password } => Ok((
            StatusCode::CREATED,
            Json(share_with_link(&state, Some(user.id), body.id, expires, password).await?),
        )
            .into_response()),
    }
}

/// Helper function for sharing a file with using a link
pub async fn share_with_link(
    state: &AppState,
    user: Option<Uuid>,
    file_id: Uuid,
    expires: u64,
    password: Option<String>,
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
                state
                    .argon2
                    .hash_password(password.as_bytes(), &salt)
                    .map_err(|_| {
                        AppError::UserError((
                            StatusCode::BAD_REQUEST,
                            "Unable to hash password".into(),
                        ))
                    })?
                    .to_string(),
            )
        }
        None => None,
    };

    // Everything is good so insert the link
    sqlx::query!(
        "INSERT INTO share_link (id, file_id, expires_at, password_hash) VALUES (?, ?, ?, ?)",
        link,
        file_id,
        expires,
        password_hash
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
        "INSERT INTO share_user (file_id, user_id, encrypted_key) VALUES (?, ?, ?)",
        file_id,
        receiver_id,
        encrypted_key
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
        (status = OK, description = "File successfully retrieved", body = FileMetadata),
        (status = BAD_REQUEST, description = "Invalid query params", body = ErrorResponse),
        (status = NOT_FOUND, description = "File not found", body = ErrorResponse),
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn get_shared_file(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Query(params): Query<FileQuery>,
) -> Result<Response, AppError> {
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
                        share_user.encrypted_key,
                        nonce,
                        owner_id,
                        is_directory,
                        mime,
                        size,
                        file.created_at,
                        modified_at
                    FROM file
                    JOIN share_user ON file.id = share_user.file_id
                    WHERE
                        user_id = ? AND 
                        id = COALESCE(?, id)
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
                FROM (SELECT * FROM children ORDER BY depth LIMIT ? OFFSET ?) ORDER BY depth DESC
    "#,
        user.id,
        params.id,
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
            id: row.id,
            created_at: row.created_at.and_utc(),
            modified_at: row.modified_at.and_utc(),
            owner_id: row.owner_id,
            upload: UploadMetadata {
                encrypted_file_name: row.encrypted_name,
                encrypted_mime_type: row.mime,
                encrypted_key: row.encrypted_key,
                nonce: row.nonce,
                is_directory: row.is_directory.is_some_and(|is_directory| is_directory),
                parent_id: row.parent_id,
            },
            children: Vec::new(),
        })
        .hierarchify();
    if params.id.is_some() && root.is_empty() {
        Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )))
    } else {
        Ok((StatusCode::OK, Json(root)).into_response())
    }
}
