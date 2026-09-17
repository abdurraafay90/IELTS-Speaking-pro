# Deployment Guide: IELTS Speaking Practice Pro on Vercel

This guide provides step-by-step instructions to deploy **IELTS Speaking Practice Pro** to Vercel and map it to your custom domain: **`speaking.araafay.online`**.

---

## Architecture Summary
- **Frontend:** React SPA built with glassmorphic dark theme, question bank, and speech analytics.
- **Backend:** Python Serverless API in `/api/index.py` running FastAPI on Vercel.
- **Single Domain:** Vercel routes `/api/*` to the Python serverless function and all other traffic to the React application under the exact same domain. No CORS hurdles or multiple deployments needed.
- **Security:** Gated with single sign-in password (`speaking30`). The backend rejects any requests that do not provide this password, protecting your OpenAI API credits from unauthorized public access.

---

## Option A: Deploy via Vercel Dashboard (Recommended)

### Step 1: Push Changes to GitHub
Commit and push your updated repository to GitHub:
```bash
git add .
git commit -m "feat: upgrade to v2 with password gate, gpt-4o examiner, and vercel deployment"
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
| `OPENAI_EVAL_MODEL` | `gpt-4o` | Senior examiner model (`gpt-4o` or `gpt-4o-mini`) |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Audio transcription model |

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
2. Enter the access password: **`speaking30`**.
3. Select an IELTS Speaking section (Part 1, 2, or 3) or click **"🎲 Pick Random Question"**.
4. Click **"Start Recording Response"** and speak into the microphone.
5. Click **"Stop & Score Speaking"**.
6. The AI transcribes the response, calculates Words-Per-Minute (WPM), and provides official British Council / IDP Band Scores with Band 8+ lexical upgrades and a native model answer!
7. Click **"💾 Download Complete IELTS Report"** to save feedback as a Markdown document.
