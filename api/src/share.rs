use std::time::Duration;

use axum::{
    extract::State,
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
    upload::is_owner,
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
        ShareRequestType::Link { expires } => Ok((
            StatusCode::CREATED,
            Json(share_with_link(&state, Some(user.id), body.id, expires).await?),
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

    // Everything is good so insert the link
    sqlx::query!(
        "INSERT INTO share_link (id, file_id, expires_at) VALUES (?, ?, ?)",
        link,
        file_id,
        expires
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
    if !is_owner(&state.pool, &owner_id, &file_id).await? {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "File not found".into(),
        )));
    }
    sqlx::query!(
        "INSERT INTO share_user (file_id, user_id, encrypted_key) VALUES (?, ?, ?)",
        file_id,
        receiver_id,
        encrypted_key
    )
    .execute(&state.pool)
    .await?;
    Ok(())
}
