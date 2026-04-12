-- ════════════════════════════════════════════════
-- FULL CHAT v2 — Supabase Setup
-- Paste into SQL Editor and click Run
-- ════════════════════════════════════════════════

-- Testers table
CREATE TABLE IF NOT EXISTS testers (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  invite_code      TEXT NOT NULL UNIQUE,
  active           BOOLEAN DEFAULT true,
  tokens_remaining INT DEFAULT 200,
  tokens_used      INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Generations log
CREATE TABLE IF NOT EXISTS generations (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tester_id        UUID REFERENCES testers(id),
  prompt           TEXT,
  persona          TEXT,
  tokens_used      INT,
  article_headline TEXT,
  used_gemini      BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Seed testers — edit names and codes as needed
INSERT INTO testers (name, invite_code, tokens_remaining) VALUES
  ('Alex',  'ALEX01', 500),
  ('Jake',  'JAKE01', 200),
  ('Tester3', 'FC001', 200),
  ('Tester4', 'FC002', 200)
ON CONFLICT (invite_code) DO NOTHING;

-- Done! You should see: testers, generations tables
