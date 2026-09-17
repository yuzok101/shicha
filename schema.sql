PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE recipes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,category TEXT NOT NULL,minutes INTEGER NOT NULL DEFAULT 0,ingredients TEXT NOT NULL CHECK(json_valid(ingredients)),steps TEXT NOT NULL CHECK(json_valid(steps)),notes TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER);
CREATE INDEX recipes_user_updated ON recipes(user_id,updated_at DESC);
CREATE TABLE recipe_versions(id TEXT PRIMARY KEY,recipe_id TEXT NOT NULL,user_id TEXT NOT NULL,snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),created_at INTEGER NOT NULL);
CREATE INDEX versions_owner_recipe ON recipe_versions(user_id,recipe_id,created_at DESC);
CREATE TABLE cooking_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,recipe_id TEXT NOT NULL,current_step INTEGER NOT NULL DEFAULT 0,timer_target INTEGER,started_at INTEGER NOT NULL,ended_at INTEGER);
CREATE INDEX cooking_user_active ON cooking_sessions(user_id,ended_at);
