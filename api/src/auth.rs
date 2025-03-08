use anyhow::anyhow;
use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts, State},
    http::{header::COOKIE, request::Parts},
};
use tracing::{instrument, Level};
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

#[derive(Debug)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub session_number: i64,
}

#[derive(Debug)]
pub struct SessionAuth(pub User);

/// Attempt to extract the user from the request's session cookie.
impl<S> FromRequestParts<S> for SessionAuth
where
    S: Send + Sync,
    State<AppState>: FromRequestParts<S>,
{
    #[doc = " If the extractor fails it\'ll use this \"rejection\" type. A rejection is"]
    #[doc = " a kind of error that can be converted into a response."]
    type Rejection = AppError;

    #[doc = " Perform the extraction."]
    #[instrument(err(level = Level::WARN), skip(parts, state), name = "session_handler", level = "warn")]
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        <Self as axum::extract::OptionalFromRequestParts<S>>::from_request_parts(parts, state)
            .await
            .and_then(|res| res.ok_or(AppError::AuthError(anyhow!("No cookies provided"))))
    }
}

/// Optionally extract the user from the session to allow for
/// differing behavior based on whether the user is logged in or not.
impl<S> OptionalFromRequestParts<S> for SessionAuth
where
    S: Send + Sync,
    State<AppState>: FromRequestParts<S>,
{
    #[doc = " If the extractor fails it\'ll use this \"rejection\" type. A rejection is"]
    #[doc = " a kind of error that can be converted into a response."]
    type Rejection = AppError;

    #[doc = " Perform the extraction."]
    #[instrument(err(level = Level::WARN), skip(parts, state), name = "session_handler")]
    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> Result<Option<Self>, Self::Rejection> {
        let State(state) = State::<AppState>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Generic(anyhow!("Database error")))?;
        let cookies = match parts.headers.get(COOKIE) {
            Some(k) => k,
            None => return Ok(None),
        };
        let session: Uuid = Uuid::try_parse(
            match cookies
                .to_str()?
                .split(';')
                .map(str::trim)
                .find_map(|x| x.strip_prefix("session="))
            {
                Some(k) => k,
                None => return Ok(None),
            },
        )?;
        let user = sqlx::query_as!(
            User,
            r#"
            SELECT user.id AS "id: _", username, email, session.number AS "session_number: _"
            FROM user
            JOIN session ON user.id = session.user_id
            WHERE session.id = ?
            AND DATETIME(last_used_at, '+' || idle_duration || ' seconds' ) >= CURRENT_TIMESTAMP
            "#,
            session
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::AuthError(anyhow!("Invalid session")))?;
        // Update the session's last_used_at timestamp so it doesn't expire
        sqlx::query!(
            "
            UPDATE session
            SET last_used_at = CURRENT_TIMESTAMP
            WHERE id = ?
            ",
            session
        )
        .execute(&state.pool)
        .await?;
        Ok(Some(SessionAuth(user)))
    }
}
