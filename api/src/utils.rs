use std::{env::current_dir, path::PathBuf};

use crate::PKG_NAME;

/// Path to the data directory for the application.
/// Falls back to the current directory if the data directory cannot be determined.
#[inline]
pub fn data_dir() -> PathBuf {
    let mut path = match dirs::data_dir() {
        Some(dir) => dir,
        None => {
            eprintln!(
                "Warning: Could not determine data directory. Attempting to use current directory."
            );
            current_dir().unwrap()
        }
    };
    path.push(PKG_NAME);
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
}

/// Path to the config directory for the application.
/// Falls back to the current directory if the config directory cannot be determined.
#[inline]
pub fn config_dir() -> PathBuf {
    let mut path = match dirs::config_dir() {
        Some(dir) => dir,
        None => {
            eprintln!(
                "Warning: Could not determine config directory. Attempting to use current directory."
            );
            current_dir().unwrap()
        }
    };
    path.push(PKG_NAME);
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
}
