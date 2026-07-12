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

## OTP Behavior Without SMTP/Twilio

When no SMS/email service is configured (the default for free-tier deploys):

- OTP codes are generated and **logged server-side only** (visible in Render logs).
- The frontend shows a demo modal with the OTP for testing convenience.
- Registration and login still work — just check the backend logs for the OTP value.

This is by design for a prototype. To enable real OTP delivery, set `TWILIO_*` environment variables.

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
| `TWILIO_ACCOUNT_SID` | Real SMS OTP delivery |
| `TWILIO_AUTH_TOKEN` | Real SMS OTP delivery |
| `TWILIO_PHONE_NUMBER` | Real SMS OTP delivery |
| `POSTGRES_URL` | Use PostgreSQL instead of SQLite |
| `MONGODB_URL` | MongoDB for analytics |
| `REDIS_URL` | Redis for caching |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Points at the deployed backend (e.g., `https://app.onrender.com/api/v1`) |
