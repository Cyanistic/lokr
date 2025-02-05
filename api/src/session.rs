use axum::{
    extract::State,
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
