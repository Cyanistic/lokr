use core::fmt;
use std::fmt::{Display, Formatter};

use axum::{
    extract::rejection::JsonRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use tracing::{error, warn};
use utoipa::ToSchema;
use validator::Validate;

/// Error that wraps `anyhow::Error`.
/// Useful to provide more fine grained error handling in our application.
/// Helps us debug errors in the code easier and gives the client a better idea of what went wrong.
pub enum AppError {
    JsonRejection(JsonRejection),
    SqlxError(sqlx::Error),
    SerdeError(sonic_rs::Error),
    ValidationError(Vec<AppValidationError>),
    AuthError(anyhow::Error),
    UserError((StatusCode, Box<str>)),
    Generic(anyhow::Error),
}

/// A JSON response for errors that includes the error type and message
/// Used in both WebSockets and HTTP responses to notify the client of errors
#[derive(Serialize, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    error_type: String,
    message: String,
}

impl AppError {
    /// Get the error type as a string to notify the client of what went wrong
    pub fn r#type(&self) -> String {
        match self {
            AppError::JsonRejection(_) => "JsonRejection".to_owned(),
            AppError::ValidationError(_) => "ValidationError".to_owned(),
            AppError::SerdeError(_) => "SerdeError".to_owned(),
            AppError::AuthError(_) => "AuthError".to_owned(),
            AppError::SqlxError(_) => "SqlxError".to_owned(),
            AppError::Generic(_) => "Generic".to_owned(),
            AppError::UserError(_) => "User".to_owned(),
        }
    }
}

// Implement `Display` for `AppError` to allow us to format the error as a string.
impl Display for AppError {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        match self {
            AppError::JsonRejection(rejection) => write!(f, "{}", rejection.body_text()),
            AppError::SerdeError(e) => write!(f, "{}", e),
            AppError::ValidationError(e) => write!(f, "{}", sonic_rs::to_string(&e).unwrap()),
            AppError::AuthError(e) => write!(f, "{}", e),
            AppError::SqlxError(e) => write!(f, "{}", e),
            AppError::Generic(err) => write!(f, "{}", err),
            AppError::UserError((_, err)) => write!(f, "{}", err),
        }
    }
}

/// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Warn about user errors and log them, but error about server errors
        match self {
            AppError::JsonRejection(_)
            | AppError::AuthError(_)
            | AppError::ValidationError(_)
            | AppError::SerdeError(_)
            | AppError::UserError(_) => warn!("{}", self),
            AppError::SqlxError(_) | AppError::Generic(_) => error!("{}", self),
        }
        let (status, message) = match &self {
            AppError::JsonRejection(rejection) => (rejection.status(), rejection.body_text()),
            AppError::SerdeError(e) => (StatusCode::BAD_REQUEST, e.to_string()),
            AppError::ValidationError(e) => {
                (StatusCode::BAD_REQUEST, sonic_rs::to_string(&e).unwrap())
            }
            AppError::AuthError(e) => (StatusCode::UNAUTHORIZED, e.to_string()),
            AppError::UserError((code, e)) => (*code, e.to_string()),
            AppError::SqlxError(_) | AppError::Generic(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".to_owned(),
            ),
        };
        // Return a JSON response with the error type and message.
        (
            status,
            Json(ErrorResponse {
                error_type: self.r#type(),
                message,
            }),
        )
            .into_response()
    }
}

// Implement `From` for `AppError` to implicitly convert from `anyhow::Error`
// This lets us use `?` without having to wrap every error in `AppError` because the compiler will
// authomatically convert it for us.
impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        let err: anyhow::Error = err.into();
        // Use downcast_ref to check the underlying error type and return the appropriate variant
        // we can't use downcast to check because it consumes the error and does not implement `Clone`
        // We don't need to add `AuthError` or `ValidationError` because we will handle those
        // explicitly in our application.
        if err.downcast_ref::<JsonRejection>().is_some() {
            return Self::JsonRejection(err.downcast().unwrap());
        } else if err.downcast_ref::<sqlx::Error>().is_some() {
            return Self::SqlxError(err.downcast().unwrap());
        } else if err.downcast_ref::<sonic_rs::Error>().is_some() {
            return Self::SerdeError(err.downcast().unwrap());
        } else {
            return Self::Generic(err);
        }
    }
}

/// A more descriptive error message for validation errors
#[derive(Serialize, Debug)]
pub struct AppValidationError {
    field: String,
    message: String,
}

/// An error type for validation errors
/// This is useful because we can return a JSON response with the error type and message
/// to provide the client with a clearer error message than what the default `validator`
/// crate provides.
pub trait AppValidate {
    fn app_validate(&self) -> Result<(), AppError>;
}

impl<T: Validate> AppValidate for T {
    fn app_validate(&self) -> Result<(), AppError> {
        // If validation fails, return a JSON response with the error type and message
        if let Err(err) = self.validate() {
            // Iterater over the field errors and map them to `AppValidationError`
            let errors: Vec<AppValidationError> = err
                .field_errors()
                .iter()
                .flat_map(|(field, errors)| {
                    errors.iter().map(move |error| AppValidationError {
                        field: field.to_string(),
                        message: error.code.to_string(),
                    })
                })
                .collect();
            return Err(AppError::ValidationError(errors));
        }
        Ok(())
    }
}
