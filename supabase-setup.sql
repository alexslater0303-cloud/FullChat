-- ════════════════════════════════════════════════════
-- FULL CHAT — Supabase Setup
-- Paste this entire file into the Supabase SQL editor
-- and click Run. That's it.
-- ════════════════════════════════════════════════════

-- ── Testers table ─────────────────────────────────
-- One row per trusted tester you invite
CREATE TABLE testers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,           -- Their first name, used in greeting
  invite_code     TEXT NOT NULL UNIQUE,    -- The code you give them e.g. 'JAKE01'
  active          BOOLEAN DEFAULT true,    -- Set to false to revoke access
  tokens_remaining INT DEFAULT 200,        -- Starting balance
  tokens_used     INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Generations table ─────────────────────────────
-- Log of every article generated — useful for seeing
-- what prompts testers are actually using
CREATE TABLE generations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tester_id       UUID REFERENCES testers(id),
  prompt          TEXT,
  persona         TEXT,
  tokens_used     INT,
  article_headline TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Helper function for token increment ───────────
CREATE OR REPLACE FUNCTION increment(row_id UUID, amount INT)
RETURNS INT AS $$
  UPDATE testers
  SET tokens_used = tokens_used + amount
  WHERE id = row_id
  RETURNING tokens_used;
$$ LANGUAGE SQL;

-- ── Seed your first testers ───────────────────────
-- Add one row per person you want to invite.
-- Change the names and codes to whatever you like.
-- Codes can be anything — keep them simple to type.
INSERT INTO testers (name, invite_code, tokens_remaining) VALUES
  ('Alex',  'ALEX01',  500),   -- You — bigger balance for testing
  ('Jake',  'JAKE01',  200),
  ('Tester3', 'FC001', 200),
  ('Tester4', 'FC002', 200);

-- ════════════════════════════════════════════════════
-- Done. You should now see two tables in your
-- Supabase Table Editor: testers and generations.
-- ════════════════════════════════════════════════════
