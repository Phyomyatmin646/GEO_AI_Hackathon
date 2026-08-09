CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    phone TEXT NOT NULL,
    location TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (username = BTRIM(username)),
    CHECK (CHAR_LENGTH(username) BETWEEN 3 AND 50),
    CHECK (username !~ '[[:cntrl:][:space:]]'),
    CHECK (phone ~ '^[+][1-9][0-9]{6,14}$' AND phone !~ '^[+]950'),
    CHECK (location = BTRIM(location)),
    CHECK (CHAR_LENGTH(location) BETWEEN 2 AND 160),
    CHECK (location !~ '[[:cntrl:]]'),
    CHECK (email IS NULL OR (
        email = LOWER(email)
        AND CHAR_LENGTH(email) <= 254
        AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ))
);

CREATE UNIQUE INDEX app_users_username_unique_idx
    ON app_users (LOWER(username));
CREATE UNIQUE INDEX app_users_phone_unique_idx
    ON app_users (phone);
CREATE UNIQUE INDEX app_users_email_unique_idx
    ON app_users (LOWER(email))
    WHERE email IS NOT NULL;
