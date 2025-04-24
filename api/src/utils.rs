use std::collections::{HashMap, HashSet};

use anyhow::Result;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::{download::FileMetadata, users::PublicUser, UPLOAD_DIR};
pub const NONCE_LENGTH: usize = 12;

macro_rules! log_err {
    ($inner:expr) => {{
        if let Err(e) = ($inner) {
            ::tracing::error!(
                "Error cleaning up database: {}",
                $crate::error::AppError::from(e)
            );
        }
    }};
}

#[macro_export]
macro_rules! check_nonce {
    ($nonce:expr, $msg:expr) => {{
        use ::base64::engine::Engine;
        use $crate::error::AppError;
        use $crate::utils::NONCE_LENGTH;

        let mut buf: [u8; NONCE_LENGTH] = [0; NONCE_LENGTH];
        if !::base64::engine::general_purpose::STANDARD
            .decode_slice(($nonce), &mut buf)
            .is_ok_and(|num| num == NONCE_LENGTH)
        {
            Err(AppError::UserError((
                StatusCode::BAD_REQUEST,
                ($msg).into(),
            )))
        } else {
            Ok(())
        }
    }};
    ($nonce:expr) => {
        check_nonce!($nonce, "Provided nonce is not the correct length!")
    };
}

pub fn levenshtien(a: &str, b: &str) -> usize {
    let len_a = a.chars().count();
    let len_b = b.chars().count();
    if len_a < len_b {
        return levenshtien(b, a);
    }
    // handle special case of 0 length
    if len_a == 0 {
        return len_b;
    } else if len_b == 0 {
        return len_a;
    }

    let len_b = len_b + 1;

    let mut pre;
    let mut tmp;
    let mut cur = vec![0; len_b];

    // initialize string b
    for i in 1..len_b {
        cur[i] = i;
    }

    // calculate edit distance
    for (i, ca) in a.chars().enumerate() {
        // get first column for this row
        pre = cur[0];
        cur[0] = i + 1;
        for (j, cb) in b.chars().enumerate() {
            tmp = cur[j + 1];
            cur[j + 1] = std::cmp::min(
                // deletion
                tmp + 1,
                std::cmp::min(
                    // insertion
                    cur[j] + 1,
                    // match or substitution
                    pre + if ca == cb { 0 } else { 1 },
                ),
            );
            pre = tmp;
        }
    }
    cur[len_b - 1]
}

pub trait Normalize: Iterator {
    fn normalize(self) -> (HashMap<Uuid, Self::Item>, Vec<Uuid>);
}
impl<T: Iterator<Item = FileMetadata>> Normalize for T {
    /// Convert rows into a tree like structure that represents the hierarchy of the files
    fn normalize(self) -> (HashMap<Uuid, Self::Item>, Vec<Uuid>) {
        self.fold(
            (HashMap::new(), Vec::new()),
            |(mut map, mut root): (HashMap<Uuid, FileMetadata>, _), cur| {
                let uuid = cur.id;
                match cur.upload.parent_id {
                    // Normally we would need to worry about the parent_id being inserted into the file
                    // map before the child node. However, we have our queries return files/directories
                    // ordered by depth, so we can be sure that the parents always appear before the
                    // children
                    Some(parent_id) => {
                        map.entry(parent_id)
                            .and_modify(|entry| entry.children.push(uuid));
                    }
                    None => {
                        root.push(uuid);
                    }
                }
                map.entry(uuid)
                    .and_modify(|e| {
                        if cur
                            .edit_permission
                            .is_some_and(|edit_permission| edit_permission)
                        {
                            e.edit_permission = Some(true);
                        }
                    })
                    .or_insert(cur);
                (map, root)
            },
        )
    }
}

/// Clean up the database by removing expired sessions and share links
pub async fn clean_up(pool: &SqlitePool) {
    // Use log_err! to log errors without returning them to the caller
    log_err!(
    sqlx::query!("DELETE FROM session WHERE DATETIME(last_used_at, '+' || idle_duration || ' seconds' ) < CURRENT_TIMESTAMP")
        .execute(pool)
        .await);
    log_err!(
        sqlx::query!("DELETE FROM share_link WHERE DATETIME(expires_at) < CURRENT_TIMESTAMP")
            .execute(pool)
            .await
    );
    // Delete all files that are not owned by a user and are not shared
    log_err!('e: {
        let deleted_files = match sqlx::query!(
            r#"
        DELETE FROM file
        WHERE owner_id IS NULL
        AND id NOT IN
        (SELECT file_id FROM share_link WHERE DATETIME(expires_at) >= CURRENT_TIMESTAMP)
        RETURNING id AS "id: Uuid"
        "#
        )
        .fetch_all(pool)
        .await
        {
            Ok(k) => k,
            Err(e) => break 'e Err(e),
        };
        for file in deleted_files {
            log_err!(std::fs::remove_file(&*UPLOAD_DIR.join(file.id.to_string())));
        }
        Ok(())
    });
}

/// Get the user ids referenced by a map of files
pub async fn get_file_users(
    pool: &SqlitePool,
    files: &HashMap<Uuid, FileMetadata>,
) -> Result<HashMap<Uuid, PublicUser>> {
    let user_set = files.iter().fold(HashSet::new(), |mut acc, cur| {
        if let Some(owner_id) = cur.1.owner_id {
            acc.insert(owner_id);
        }
        if let Some(uploader_id) = cur.1.uploader_id {
            acc.insert(uploader_id);
        }
        acc
    });
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        r#"
        SELECT id, username, email, public_key,
        avatar AS avatar_extension, NULL AS password_salt
        FROM user WHERE id IN ("#,
    );
    let mut separated = builder.separated(", ");
    for user in &user_set {
        separated.push_bind(user);
    }
    separated.push_unseparated(")");
    let query = builder.build_query_as::<PublicUser>();
    Ok(query
        .fetch_all(pool)
        .await?
        .into_iter()
        .fold(HashMap::new(), |mut acc, cur| {
            acc.insert(cur.id, cur);
            acc
        }))
}
