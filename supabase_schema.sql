-- Supabase Schema Initialization for RecruitGO

-- 1. Create Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create Candidates Table
CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT,
    company TEXT,
    location TEXT,
    skills TEXT,
    url TEXT UNIQUE,
    source TEXT DEFAULT 'Manual',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Create Pipeline Table (Links Jobs to Candidates)
CREATE TABLE IF NOT EXISTS pipeline (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Sourced',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(job_id, candidate_id)
);

-- 4. Create Chat Messages Table (Phase 3)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Enable Realtime on messages
alter publication supabase_realtime add table messages;

-- 6. Setup Full-Text Search for Internal ATS (Phase 2)
-- We add a generated tsvector column to the candidates table to make searching lightning fast
ALTER TABLE candidates ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(skills, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
) STORED;

-- Create an index on the search vector
CREATE INDEX candidates_search_idx ON candidates USING GIN (search_vector);
