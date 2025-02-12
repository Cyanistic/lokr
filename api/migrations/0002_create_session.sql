CREATE TABLE session (
    id BLOB PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    idle_duration INTEGER NOT NULL DEFAULT 10800, -- Duration of inactivity in seconds before the session is invalidated (currently 3 hours, should be 30 minutes upon release)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user (id)
);
