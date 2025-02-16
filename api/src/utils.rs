use std::collections::HashMap;

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{error::AppError, upload::FileMetadata};

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

pub trait Hierarchify: Iterator {
    fn hierarchify(self) -> Vec<Self::Item>;
}
impl<T: Iterator<Item = FileMetadata>> Hierarchify for T {
    /// Convert rows into a tree like structure that represents the hierarchy of the files
    fn hierarchify(self) -> Vec<Self::Item> {
        self.fold(
            HashMap::new(),
            |mut acc: HashMap<Option<Uuid>, Vec<FileMetadata>>, mut cur| {
                // Check if the current file has children that we have previously
                // saved in our accumulator. If so, then we can move those
                // children to the current file.
                if let Some(children) = acc.remove(&Some(cur.id)) {
                    cur.children = children;
                }
                // Add the current file to the accumulator based on its parent_id
                // so that we can later move its children to it if they exist.
                acc.entry(cur.upload.parent_id)
                    .and_modify(|entry| entry.push(cur.clone()))
                    .or_insert_with(|| vec![cur]);
                acc
            },
        )
        // Files and directories in the root should have a parent_id of None so we remove it from the map
        // If everything went well, the only key left in the map should be None or the id provided. As
        // childern are moved to their parents, their parent_id is removed from the map.
        .into_values()
        .flatten()
        // A user may have no files, so we default to an empty root directory
        .collect()
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
