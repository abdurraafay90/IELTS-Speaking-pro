# Deployment Guide: IELTS Speaking Practice Pro on Vercel

This guide provides step-by-step instructions to deploy **IELTS Speaking Practice Pro** to Vercel and map it to your custom domain: **`speaking.araafay.online`**.

---

## Architecture Summary
- **Frontend:** React SPA built with glassmorphic dark theme, Cambridge IELTS practice test bank selector, Part 2 1-minute prep timer, and speech analytics.
- **Backend:** Python Serverless API in `/api/index.py` running FastAPI on Vercel.
- **Single Domain:** Vercel routes `/api/*` to the Python serverless function and all other traffic to the React application under the exact same domain. No CORS hurdles or multiple deployments needed.
- **Credit Protection & Security:** Gated with single sign-in password (`speaking30`). Built-in hard 5-minute recording limit (frontend auto-stop at 300s and backend 15MB file ceiling) ensures candidates never leave the mic recording accidentally and exhaust your OpenAI credits.
- **Expression & Stutter Checking:** The evaluation prompt actively audits continuity, filler words ('um', 'uh', 'like'), stutters, mid-sentence lags, and natural spoken expression.

---

## Option A: Deploy via Vercel Dashboard (Recommended)

### Step 1: Push Changes to GitHub
Commit and push your updated repository to GitHub:
```bash
git push origin main
```

### Step 2: Import Project in Vercel
1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **"Add New..."** > **"Project"**.
3. Select your repository: `abdurraafay90/IELTS-Speaking-pro`.
4. Keep the **Root Directory** as `./` (default).
5. Vercel will automatically read `vercel.json` and configure:
   - Build Command: `cd frontend && npm install && npm run build`
   - Output Directory: `frontend/build`

### Step 3: Configure Environment Variables
In the **Environment Variables** section on Vercel, add the following variables:

| Variable Name | Recommended Value | Description |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | `sk-...` | Your personal OpenAI API key (credits expiring Oct 1) |
| `APP_PASSWORD` | `speaking30` | Access password required to use the app |
| `OPENAI_EVAL_MODEL` | `gpt-5.6-luna` | Senior examiner model (`gpt-5.6-luna`, with automatic fallback to `gpt-4o` / `gpt-4o-mini`) |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe` | Audio transcription model (high-accuracy, with fallbacks to `whisper-1` / `gpt-4o-mini-transcribe`) |

Click **"Deploy"**. Vercel will build the frontend and serverless function in about 1–2 minutes.

---

## Option B: Deploy via Vercel CLI

If you prefer deploying from your terminal:
```bash
npx vercel
```
- Link to your Vercel account when prompted.
- Set environment variables via CLI or in the project dashboard.
- For production deployment:
```bash
npx vercel --prod
```

---

## Custom Domain Setup: `speaking.araafay.online`

### Step 1: Add Domain in Vercel
1. In your Vercel project dashboard, navigate to **Settings** > **Domains**.
2. Type **`speaking.araafay.online`** into the input field and click **Add**.

### Step 2: Add DNS Record in Your Domain Registrar / DNS Provider
Open the DNS Management console where `araafay.online` is managed (e.g. Cloudflare, Namecheap, Hostinger, GoDaddy):

Add the following DNS record:
- **Type:** `CNAME`
- **Name / Host:** `speaking`
- **Target / Value:** `cname.vercel-dns.com`
- **TTL:** Auto or `3600`
- *(Note if using Cloudflare: Set Proxy Status to **DNS only** (grey cloud) during initial SSL issuance).*

### Step 3: Verification & SSL
Within a few minutes:
- Vercel will detect the DNS record and display a green checkmark.
- Vercel automatically generates a free Let's Encrypt SSL/TLS certificate (HTTPS).
- Your app is now live at: **`https://speaking.araafay.online`**!

---

## How Your Friend Uses the App

1. Visit **`https://speaking.araafay.online`**.
2. Enter candidate name (e.g. Alex) and the access password: **`speaking30`**.
3. Select an authentic Cambridge test (Cambridge 17–19 Tests 1–4) or switch between Part 1, 2, or 3.
4. For Part 2, click **"⏱️ Start 1-Min Prep & Auto-Record"** to take notes with an 880Hz audio chime cue when time is up.
5. Speak into the microphone (with automatic 5-minute cutoff protection).
6. Click **"⏹️ Stop & Score Speaking"** (or let it auto-stop at 5 minutes).
7. The AI transcribes the response, calculates Words-Per-Minute (WPM), diagnoses expressions/stutters/fillers, and provides official British Council / IDP Band Scores with Band 8+ lexical upgrades and a native model answer!
8. Click **"💾 Download Complete IELTS Report"** to save feedback as a Markdown document.
