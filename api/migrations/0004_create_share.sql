CREATE TABLE share_user (
    file_id BLOB NOT NULL,   	 
    user_id BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    encrypted_key BLOB NOT NULL, -- The file key encrypted with the user's public key
    PRIMARY KEY (file_id, user_id),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
);

CREATE TABLE share_link (
    id BLOB PRIMARY KEY NOT NULL, -- UUIDv7
    file_id BLOB NOT NULL,   	 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- NULL for never
    FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
);
