use std::collections::{HashMap, HashSet};

use anyhow::Result;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::{error::AppError, upload::FileMetadata, users::PublicUser};

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
        self.fold((HashMap::new(), Vec::new()), |(mut map, mut root), cur| {
            let uuid = cur.id;
            if cur.upload.parent_id.is_none() {
                root.push(uuid);
            }
            map.insert(uuid, cur);
            (map, root)
        })
    }
}

/// Clean up the database by removing expired sessions and share links
pub async fn clean_up(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query!("DELETE FROM session WHERE DATETIME(last_used_at, '+' || idle_duration || ' seconds' ) < CURRENT_TIMESTAMP")
        .execute(pool)
        .await?;
    sqlx::query!("DELETE FROM share_link WHERE DATETIME(expires_at) < CURRENT_TIMESTAMP")
        .execute(pool)
        .await?;
    Ok(())
}

/// Get the user ids referenced by a map of files
pub async fn get_file_users(
    pool: &SqlitePool,
    files: &HashMap<Uuid, FileMetadata>,
) -> Result<HashMap<Uuid, PublicUser>> {
    let owner_set = files.iter().fold(HashSet::new(), |mut acc, cur| {
        if let Some(owner_id) = cur.1.owner_id {
            acc.insert(owner_id);
        }
        acc
    });
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new("SELECT id, username, email, public_key, avatar AS avatar_extension FROM user WHERE id IN (");
    let mut separated = builder.separated(", ");
    for owner in &owner_set {
        separated.push_bind(owner);
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
