# Full Chat v2 — Deployment Guide

## Step 1 — Push to GitHub
```
git init
git add .
git commit -m "Full Chat v2"
git remote add origin https://github.com/YOURUSERNAME/fullchat.git
git push -u origin main
```

## Step 2 — Supabase
1. supabase.com → New project
2. SQL Editor → paste supabase-setup.sql → Run
3. Project Settings → API → copy Project URL + service_role key

## Step 3 — Get your Pexels API key
1. pexels.com/api → click "Get Started"
2. Instant approval, free, no card needed

## Step 4 — Deploy to Vercel
```
npm install -g vercel
vercel
```

## Step 5 — Add these 5 environment variables in Vercel dashboard
Project → Settings → Environment Variables:

| Variable            | Where to get it                          |
|---------------------|------------------------------------------|
| ANTHROPIC_API_KEY   | console.anthropic.com → API Keys        |
| GEMINI_API_KEY      | aistudio.google.com → Get API Key       |
| PEXELS_API_KEY      | pexels.com/api                           |
| SUPABASE_URL        | Supabase → Project Settings → API       |
| SUPABASE_SERVICE_KEY| Supabase → Project Settings → API (service_role) |

## Step 6 — Redeploy
Vercel → Deployments → three dots → Redeploy

## Step 7 — Test
Open the URL, enter ALEX01, generate an article.

## Tester codes
- Alex:    ALEX01 (500 tokens)
- Jake:    JAKE01 (200 tokens)
- Tester3: FC001  (200 tokens)
- Tester4: FC002  (200 tokens)

Add more in Supabase → Table Editor → testers → Insert row.
