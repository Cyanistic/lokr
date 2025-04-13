use core::fmt;
use std::fmt::{Display, Formatter};

use axum::{
    extract::rejection::JsonRejection,
    http::{header::SET_COOKIE, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use utoipa::{openapi::ObjectBuilder, PartialSchema, ToSchema};
use validator::Validate;

/// Error that wraps `anyhow::Error`.
/// Useful to provide more fine grained error handling in our application.
/// Helps us debug errors in the code easier and gives the client a better idea of what went wrong.
#[derive(Debug)]
pub enum AppError {
    JsonRejection(JsonRejection),
    SqlxError(sqlx::Error),
    SerdeError(sonic_rs::Error),
    ValidationError(Vec<AppValidationError>),
    AuthError(anyhow::Error),
    UserError((StatusCode, String)),
    Generic(anyhow::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_unit_struct(&self.r#type())
    }
}
impl ToSchema for AppError {}
impl PartialSchema for AppError {
    fn schema() -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
        ObjectBuilder::new()
            .schema_type(utoipa::openapi::Type::String)
            .enum_values(Some([
                "JsonRejection",
                "SqlxError",
                "SerdeError",
                "ValidationError",
                "AuthError",
                "UserError",
                "Generic",
            ]))
            .examples([serde_json::json!("UserError")])
            .into()
    }
}

/// A JSON response for errors that includes the error type and message
/// Used in HTTP responses to notify the client of errors
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    #[schema(example = "UserError")]
    pub r#type: AppError,
    #[schema(example = "Something went wrong")]
    pub message: String,
}

impl AppError {
    /// Get the error type as a string to notify the client of what went wrong
    pub fn r#type(&self) -> &'static str {
        match self {
            AppError::JsonRejection(_) => "JsonRejection",
            AppError::ValidationError(_) => "ValidationError",
            AppError::SerdeError(_) => "SerdeError",
            AppError::AuthError(_) => "AuthError",
            AppError::SqlxError(_) => "SqlxError",
            AppError::Generic(_) => "Generic",
            AppError::UserError(_) => "User",
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
        let mut headers = HeaderMap::new();
        let (status, message) = match &self {
            AppError::JsonRejection(rejection) => (rejection.status(), rejection.body_text()),
            AppError::SerdeError(e) => (StatusCode::BAD_REQUEST, e.to_string()),
            AppError::ValidationError(e) => {
                (StatusCode::BAD_REQUEST, sonic_rs::to_string(&e).unwrap())
            }
            AppError::AuthError(e) => {
                headers.append(SET_COOKIE, "session=; HttpOnly; Max-Age=0".parse().unwrap());
                headers.append(
                    SET_COOKIE,
                    "authenticated=; Path=/; Max-Age=0".parse().unwrap(),
                );
                (StatusCode::UNAUTHORIZED, e.to_string())
            }
            AppError::UserError((code, e)) => (*code, e.to_string()),
            AppError::SqlxError(_) | AppError::Generic(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".to_owned(),
            ),
        };
        // Return a JSON response with the error type and message.
        (
            status,
            headers,
            Json(ErrorResponse {
                r#type: self,
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
    /// The field that failed validation
    field: String,
    /// A detailed error message
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
