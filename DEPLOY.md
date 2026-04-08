# Full Chat — Deployment Checklist
Follow these steps in order. Each one should take 5–10 minutes.
Total time: roughly 45–60 minutes first time.

---

## STEP 1 — Install the tools you need

You'll need Node.js and Git installed on your Windows machine.

1. Download and install **Node.js** (LTS version):
   → https://nodejs.org

2. Download and install **Git**:
   → https://git-scm.com/download/win

3. Open a terminal (Windows Terminal or PowerShell) and verify:
   ```
   node --version
   git --version
   ```
   Both should print a version number.

4. Install the Vercel CLI:
   ```
   npm install -g vercel
   ```

---

## STEP 2 — Create your GitHub repo

1. Go to https://github.com and create a free account if you don't have one
2. Click **New repository**
3. Name it `fullchat`, set it to **Private**, click Create
4. On your machine, open a terminal in the fullchat project folder and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOURUSERNAME/fullchat.git
   git push -u origin main
   ```

---

## STEP 3 — Set up Supabase

1. Go to https://supabase.com and create a free account
2. Click **New Project** — give it any name, pick a region close to you (EU West)
3. Once it loads, go to **SQL Editor** in the left sidebar
4. Open the file `supabase-setup.sql` from this project
5. Paste the entire contents into the SQL editor and click **Run**
6. You should see two tables appear: `testers` and `generations`
7. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like https://xxxx.supabase.co)
   - **service_role** key (under Project API keys — use service_role NOT anon)

---

## STEP 4 — Get your API keys

### Anthropic (you probably already have this)
→ https://console.anthropic.com → API Keys → Create key

### YouTube Data API v3 (free)
1. Go to https://console.cloud.google.com
2. Create a new project (call it "fullchat")
3. Go to **APIs & Services → Enable APIs**
4. Search for "YouTube Data API v3" and enable it
5. Go to **Credentials → Create Credentials → API Key**
6. Copy the key

---

## STEP 5 — Deploy to Vercel

1. In your terminal (in the fullchat folder), run:
   ```
   vercel
   ```
2. Follow the prompts — log in with GitHub when asked
3. When it asks about settings, just press Enter to accept defaults
4. Once deployed, go to your Vercel dashboard at https://vercel.com
5. Open your project → **Settings → Environment Variables**
6. Add these four variables (copy from your notes):

   | Name | Value |
   |------|-------|
   | ANTHROPIC_API_KEY | sk-ant-... |
   | YOUTUBE_API_KEY | AIza... |
   | SUPABASE_URL | https://xxxx.supabase.co |
   | SUPABASE_SERVICE_KEY | eyJ... |

7. Go to **Deployments** and click **Redeploy** so the env vars take effect

---

## STEP 6 — Test it yourself first

1. Your app is now live at `https://fullchat-XXXX.vercel.app`
2. Open it and enter your invite code: **ALEX01**
3. Generate a test article — if it works, you're done
4. If anything breaks, check **Vercel → Functions → Logs** for error messages

---

## STEP 7 — Share with testers

Send each person:
- The URL: `https://fullchat-XXXX.vercel.app`
- Their personal invite code (set in supabase-setup.sql):
  - Jake: **JAKE01**
  - Tester 3: **FC001**
  - Tester 4: **FC002**

To add more testers later, go to Supabase → Table Editor → testers → Insert row.
To see what they've been generating: Table Editor → generations.

---

## Ongoing — pushing updates

Any time you make changes to the code:
```
git add .
git commit -m "describe what you changed"
git push
```
Vercel auto-deploys on every push to main. Live within ~30 seconds.

---

## If something breaks

Check these in order:
1. **Vercel → Functions → Logs** — shows backend errors
2. **Browser DevTools → Console** — shows frontend errors  
3. **Supabase → Table Editor** — check testers table has your code and active=true
4. **Vercel → Settings → Environment Variables** — check all 4 keys are set

