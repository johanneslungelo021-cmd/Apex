-- Enable the citext extension for case-insensitive string types
CREATE EXTENSION IF NOT EXISTS citext;

-- Create users table with CITEXT for the email column
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure a functional unique index is also present as a fallback/best practice
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
