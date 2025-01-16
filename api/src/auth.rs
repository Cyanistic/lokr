use anyhow::anyhow;
use axum::{
    extract::{FromRequestParts, State},
    http::{header::COOKIE, request::Parts, StatusCode},
};
use serde::de::DeserializeOwned;
use sqlx::SqlitePool;

use crate::{error::AppError, state::AppState};

pub struct User {
    id: i64,
    username: Box<str>,
    email: Option<String>,
}

pub struct SessionAuth(pub User);

impl<S> FromRequestParts<S> for SessionAuth
where
    S: Send + Sync,
    State<AppState>: FromRequestParts<S>,
{
    #[doc = " If the extractor fails it\'ll use this \"rejection\" type. A rejection is"]
    #[doc = " a kind of error that can be converted into a response."]
    type Rejection = AppError;

    #[doc = " Perform the extraction."]
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let State(state) = State::<AppState>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Generic(anyhow!("Database error")))?;
        let cookies = parts
            .headers
            .get(COOKIE)
            .ok_or_else(|| AppError::AuthError(anyhow!("No cookies provided")))?;
        let session = cookies
            .to_str()?
            .split(';')
            .map(str::trim)
            .find_map(|x| x.strip_prefix("session="));
        Ok(SessionAuth(
            sqlx::query_as!(
                User,
                r#"
            SELECT user.id, username, email
            FROM user
            JOIN session ON user.id = session.user_id
            WHERE session.id = ?
            AND expires_at > CURRENT_TIMESTAMP
            "#,
                session
            )
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| AppError::AuthError(anyhow!("Invalid session")))?,
        ))
    }
}
