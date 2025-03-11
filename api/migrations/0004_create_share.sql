CREATE TABLE share_user (
    file_id BLOB NOT NULL,   	 
    user_id BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    encrypted_key BLOB NOT NULL, -- The file key encrypted with the user's public key
    edit_permission BOOLEAN NOT NULL, -- If users with this link can edit the file or upload child documents
    PRIMARY KEY (file_id, user_id),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
);

CREATE TABLE share_link (
    id BLOB PRIMARY KEY NOT NULL, -- UUIDv7
    file_id BLOB NOT NULL,   	 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- NULL for never
    password_hash TEXT, -- NULL for no password
    edit_permission BOOLEAN NOT NULL, -- If users with this link can edit the file or upload child documents
    FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
);

CREATE INDEX idx_share_link_file_id ON share_link(file_id);
