use anyhow::anyhow;
use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts, State},
    http::{header::COOKIE, request::Parts},
};
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

pub struct User {
    pub id: [u8; 16],
    pub username: String,
    pub email: Option<String>,
}

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
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let State(state) = State::<AppState>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Generic(anyhow!("Database error")))?;
        let cookies = parts
            .headers
            .get(COOKIE)
            .ok_or_else(|| AppError::AuthError(anyhow!("No cookies provided")))?;
        let session: Uuid = Uuid::try_parse(
            cookies
                .to_str()?
                .split(';')
                .map(str::trim)
                .find_map(|x| x.strip_prefix("session="))
                .ok_or_else(|| AppError::AuthError(anyhow!("No session cookie provided")))?,
        )?;
        Ok(SessionAuth({
            let user = sqlx::query!(
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
            .ok_or_else(|| AppError::AuthError(anyhow!("Invalid session")))?;
            User {
                id: user.id.try_into().unwrap(),
                username: user.username.into(),
                email: user.email,
            }
        }))
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
        Ok(Some(SessionAuth({
            let user = sqlx::query!(
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
            .ok_or_else(|| AppError::AuthError(anyhow!("Invalid session")))?;
            User {
                id: user.id.try_into().unwrap(),
                username: user.username.into(),
                email: user.email,
            }
        })))
    }
}
