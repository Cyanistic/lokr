CREATE TABLE session (
    id BLOB PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    idle_duration INTEGER NOT NULL DEFAULT 10800, -- Duration of inactivity in seconds before the session is invalidated (currently 3 hours, should be 30 minutes upon release)
    number INTEGER NOT NULL , -- The number of the session for each user. Used to identify the session on a per user basis without exposing the session id
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, number),
    FOREIGN KEY (user_id) REFERENCES user (id)
);
