use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::SessionAuth,
    error::{AppError, ErrorResponse},
    state::AppState,
    success, SuccessResponse,
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: Uuid,
    created_at: DateTime<Utc>,
    last_used_at: DateTime<Utc>,
}

#[utoipa::path(
    get,
    path = "/api/sessions",
    description = "Get all sessions for the currently authenticated user",
    responses(
        (status = OK, description = "Sessions found", body = [Session]),
        (status = UNAUTHORIZED, description = "No user is currently authenticated", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn get_sessions(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
) -> Result<Response, AppError> {
    let query = sqlx::query_as!(
        Session,
        r#"
        SELECT id AS "id: _",
        created_at AS "created_at: _",
        last_used_at AS "last_used_at: _" FROM session WHERE user_id = ?"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok((StatusCode::OK, Json(query)).into_response())
}

#[utoipa::path(
    delete,
    path = "/api/session/{id}",
    description = "Delete an active session for the currently authenticated user",
    responses(
        (status = OK, description = "Session successfully deleted", body = SuccessResponse),
        (status = NOT_FOUND, description = "Session not found", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
pub async fn delete_session(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    if sqlx::query!(
        "DELETE FROM session WHERE id = ? AND user_id = ? RETURNING id",
        id,
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    .is_none()
    {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "Session not found".into(),
        )));
    };
    Ok((StatusCode::OK, success!("Session successfully deleted")).into_response())
}
