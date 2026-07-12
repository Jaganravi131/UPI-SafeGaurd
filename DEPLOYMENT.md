# Deployment Guide — UPI SafeGuard

> [!CAUTION]
> **Prototype only.** This deploys a demonstration system with simulated data.
> No real bank integration, no real customer data.

---

## Backend → Render (Free Tier)

### Option A: One-Click Blueprint

1. Push this repo to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect your GitHub repo — Render will detect [`render.yaml`](render.yaml) and create the service automatically.
4. The blueprint auto-generates `JWT_SECRET_KEY`. You may want to change `ADMIN_DEFAULT_PASSWORD`.

### Option B: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Web Service**.
2. Connect your GitHub repo.
3. Configure:
   | Setting | Value |
   |---------|-------|
   | **Root Directory** | `backend` |
   | **Runtime** | Docker |
   | **Plan** | Free |
   | **Health Check Path** | `/health` |
4. Add environment variables:
   | Variable | Required | Notes |
   |----------|----------|-------|
   | `JWT_SECRET_KEY` | ✅ | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
   | `ADMIN_DEFAULT_PASSWORD` | ✅ | Your admin password |
   | `CORS_ORIGINS` | ✅ | `["https://YOUR-FRONTEND.vercel.app"]` |
   | `ENVIRONMENT` | Optional | `production` |
   | `GROQ_API_KEY` | Optional | Enables AI chat features |
5. Deploy. The Dockerfile runs `train_paysim.py` at build time.

### Verify Backend

Visit `https://YOUR-APP.onrender.com/health` — you should see:
```json
{"status": "healthy", "app": "UPI SafeGuard", ...}
```

Swagger docs: `https://YOUR-APP.onrender.com/docs`

---

## Frontend → Vercel (Free Tier)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Add New** → **Project**.
2. Import your GitHub repo.
3. Configure:
   | Setting | Value |
   |---------|-------|
   | **Root Directory** | `frontend` |
   | **Framework Preset** | Vite |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |
4. Add environment variable:
   | Variable | Value |
   |----------|-------|
   | `VITE_API_BASE_URL` | `https://YOUR-BACKEND.onrender.com/api/v1` |
5. Deploy.

### Verify Frontend

Visit your Vercel URL. You should see the UPI SafeGuard landing page.

---

## OTP Behavior Without Firebase/SMTP/Twilio

When no SMS/email service is configured (the default for free-tier deploys):

- OTP codes are generated and **logged server-side only** (visible in Render logs).
- The frontend shows a demo modal with the OTP for testing convenience.
- Registration and login still work — just check the backend logs for the OTP value.

This is by design for a prototype. To enable real OTP delivery, you can configure **Firebase Phone Authentication** (described below).

---

## 📱 Phone Authentication Setup (Firebase)

To enable real SMS OTP delivery for free via Firebase Phone Authentication, perform the following setup:

### 1. Firebase Project Configuration
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Navigate to **Build** > **Authentication** > **Get Started** > **Sign-in method**.
3. Enable the **Phone** provider.
4. Navigate to **Authentication** > **Settings** > **Authorized domains** and verify that `localhost` is listed. Add your deployed frontend URL (e.g. `https://your-app.vercel.app`) to the list.

### 2. Frontend Config (Public API Keys)
1. Go to **Project settings** (gear icon) > **General** > **Your apps** > click the `</>` (Web app) icon.
2. Register your app (e.g. `upi-safeguard-web`).
3. Copy the configuration object keys (`apiKey`, `authDomain`, `projectId`, `appId`).
4. Set these values in your frontend environment variables (Vercel dashboard or local `.env`):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

### 3. Backend Config (Service Account Secrets)
1. In the Firebase console, go to **Project settings** > **Service accounts**.
2. Click **Generate new private key** to download the credentials JSON file.
3. Use the credentials JSON values to set the following backend environment variables (Render dashboard or local `.env`):
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` wrapper strings)

---

## Environment Variables Reference

### Backend (Required)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET_KEY` | Signs authentication tokens |
| `ADMIN_DEFAULT_PASSWORD` | Admin dashboard login password |
| `CORS_ORIGINS` | JSON array of allowed frontend URLs |

### Backend (Optional)

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Enables AI chat / scam advisor |
| `FIREBASE_PROJECT_ID` | Firebase Project ID for token verification |
| `FIREBASE_PRIVATE_KEY` | Firebase Service Account Private Key |
| `FIREBASE_CLIENT_EMAIL` | Firebase Service Account Client Email |
| `POSTGRES_URL` | Use PostgreSQL instead of SQLite |
| `MONGODB_URL` | MongoDB for analytics |
| `REDIS_URL` | Redis for caching |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Points at the deployed backend (e.g., `https://app.onrender.com/api/v1`) |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key for phone authentication |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication Domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID |
