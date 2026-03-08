# 🔑 UPI SafeGuard - Complete Credentials & Setup Guide

This document provides step-by-step instructions for setting up UPI SafeGuard.

---

## 📋 Quick Reference

| Service | Required | Demo Mode | Production |
|---------|----------|-----------|------------|
| PostgreSQL | ❌ No* | SQLite fallback | ✅ Required |
| MongoDB | ❌ No* | In-memory mock | ✅ Required |
| Redis | ❌ No* | In-memory mock | ✅ Required |
| JWT Secret | ✅ Yes | Auto-generated | ✅ Required |

> *Demo mode uses SQLite and in-memory mocks. No external services needed.

---

## 🚀 Quick Start (Demo Mode)

For hackathon demos, you can run without any external databases:

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

**That's it!** The app will:
- Create SQLite database automatically (`demo_database.db`)
- Use mock services for MongoDB/Redis
- Generate demo data

---

## 🔐 Demo Credentials

### User Login
| Field | Value |
|-------|-------|
| Phone | Any 10-digit number starting with 6-9 (e.g., `9876543210`) |
| OTP | Random 6-digit code — displayed on screen in demo mode |

### Admin Login
Access: http://localhost:3000/admin/login

| Method | How It Works |
|--------|--------------|
| **Demo Login** | Click the "Demo Login" button - auto-creates admin |
| **Manual Login** | Email: `admin@upisafeguard.com` / Password: `admin123` |

### Admin Auth Flow Explained

```
┌──────────────────────────────────────────────────────────────┐
│                    ADMIN AUTHENTICATION                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1: Navigate to /admin/login                            │
│                                                              │
│  STEP 2: Choose login method                                 │
│          ┌──────────────────┐   ┌──────────────────┐        │
│          │   Demo Login     │   │  Email/Password  │        │
│          │   (One Click)    │   │    (Manual)      │        │
│          └────────┬─────────┘   └────────┬─────────┘        │
│                   │                      │                   │
│  STEP 3: Backend processes request                           │
│                                                              │
│          Demo Login:                                         │
│          - Checks if admin@upisafeguard.com exists           │
│          - If no → Creates new Super Admin                   │
│          - If yes → Uses existing account                    │
│          - Password: admin123 (bcrypt hashed)                │
│                                                              │
│          Manual Login:                                       │
│          - Finds admin by email in database                  │
│          - Verifies bcrypt password hash                     │
│          - Checks if account is active                       │
│                                                              │
│  STEP 4: JWT Token Generation                                │
│          - Payload: { sub: admin_id, email, type: "admin" }  │
│          - Expiry: 12 hours                                  │
│          - Algorithm: HS256                                  │
│                                                              │
│  STEP 5: Response to Frontend                                │
│          {                                                   │
│            "access_token": "eyJhbGc...",                     │
│            "token_type": "bearer",                           │
│            "admin": { id, email, username, role, ... }       │
│          }                                                   │
│                                                              │
│  STEP 6: Frontend Storage                                    │
│          - Token → localStorage.admin_token                  │
│          - Admin object → Zustand state                      │
│          - isAdminAuthenticated → true                       │
│                                                              │
│  STEP 7: Redirect to /admin/dashboard                        │
│                                                              │
│  STEP 8: Protected Routes                                    │
│          - AdminRoute component checks auth state            │
│          - All API calls include: Authorization: Bearer xxx  │
│          - Backend validates token on each request           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Admin Roles & Permissions

| Role | Dashboard | Users | Fraud Reports | ML Models | System | Create Admins |
|------|-----------|-------|---------------|-----------|--------|---------------|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `analyst` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `support` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🗄️ Production Setup

For production deployment, set up these services:

### 1. JWT Secret Key (Required)

Generate a secure random key:

```bash
# Python
python -c "import secrets; print(secrets.token_hex(32))"

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

Add to `.env`:
```env
JWT_SECRET_KEY=your-generated-64-character-hex-string
JWT_ALGORITHM=HS256
```

### 2. PostgreSQL Database

**Option A: Local Installation**
```bash
# Windows: Download from postgresql.org
# Create database
psql -U postgres -c "CREATE DATABASE upi_safeguard;"
```

**Option B: Supabase (Free Cloud)**
1. Go to https://supabase.com
2. Create new project
3. Copy connection string from Settings → Database

```env
POSTGRES_URL=postgresql+asyncpg://postgres:password@host:5432/database
```

**Option C: Neon (Free Cloud)**
1. Go to https://neon.tech
2. Create project
3. Copy connection string

### 3. MongoDB

**Option A: Local**
```bash
# Install MongoDB Community Server
# Default URL works:
MONGODB_URL=mongodb://localhost:27017
```

**Option B: MongoDB Atlas (Free)**
1. Go to https://mongodb.com/atlas
2. Create free cluster
3. Create database user
4. Get connection string

```env
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/upi_safeguard
```

### 4. Redis

**Option A: Local**
```bash
# Windows: Use WSL or Docker
# Default URL works:
REDIS_URL=redis://localhost:6379
```

**Option B: Upstash (Free)**
1. Go to https://upstash.com
2. Create Redis database
3. Copy connection details

```env
REDIS_URL=rediss://default:password@host:port
```

---

## ⚙️ Complete Environment Variables

### Backend (`backend/.env`)

```env
# ============= REQUIRED =============
JWT_SECRET_KEY=your-64-char-hex-secret
JWT_ALGORITHM=HS256

# ============= APP CONFIG =============
APP_NAME=UPI SafeGuard
APP_VERSION=2.0.0
ENVIRONMENT=development
DEBUG=true

# ============= DATABASE (Optional in demo mode) =============
# PostgreSQL - Falls back to SQLite if unavailable
POSTGRES_URL=postgresql+asyncpg://postgres:password@localhost:5432/upi_safeguard

# MongoDB - Falls back to mock if unavailable
MONGODB_URL=mongodb://localhost:27017

# Redis - Falls back to mock if unavailable
REDIS_URL=redis://localhost:6379

# ============= CORS =============
CORS_ORIGINS=["http://localhost:3000"]

# ============= OPTIONAL SERVICES =============
# Twilio (SMS OTP - uses mock in demo mode)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Firebase (Push notifications)
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# AWS S3 (File storage)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/api/v1
```

---

## 🔍 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.10+

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Admin login fails
```bash
# 1. Check if database is created
# Look for demo_database.db in backend folder

# 2. Try demo login first (creates admin automatically)

# 3. Check backend logs for errors
```

### OTP not received
```bash
# In demo mode, OTP is shown on-screen (not sent via SMS)
# Look for a modal/toast with the 6-digit code after clicking "Request OTP"
# Twilio SMS is only used if TWILIO credentials are configured in .env
```

### Frontend can't connect to backend
```bash
# 1. Ensure backend is running on port 8000
# 2. Check CORS settings in backend config
# 3. Verify frontend .env has correct API URL
```

### Database errors
```bash
# In demo mode, delete SQLite file to reset:
rm backend/demo_database.db

# Restart backend - it will recreate tables
```

---

## 📚 API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/request-otp` | Send OTP to phone |
| POST | `/api/v1/auth/verify-otp` | Verify OTP and get token |
| POST | `/api/v1/auth/register` | Register new user |

### Admin Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/auth/login` | Admin login |
| POST | `/api/v1/admin/auth/demo-login` | Demo admin login |
| POST | `/api/v1/admin/auth/logout` | Logout |
| GET | `/api/v1/admin/auth/me` | Current admin info |
| POST | `/api/v1/admin/auth/create-first-admin` | Bootstrap admin |

### Admin Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/dashboard/overview` | Dashboard stats |
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/fraud-reports` | List fraud reports |
| GET | `/api/v1/admin/ml/performance` | ML model metrics |
| GET | `/api/v1/admin/system/health` | System status |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transactions/assess-risk` | ML risk assessment |
| POST | `/api/v1/transactions/` | Create transaction |
| GET | `/api/v1/transactions/` | Transaction history |

### AI Intervention
| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/api/v1/intervention/ws/{user_id}` | WebSocket connection |
| POST | `/api/v1/intervention/check` | Check if intervention needed |
| POST | `/api/v1/intervention/resolve` | Resolve intervention |
| GET | `/api/v1/intervention/active/{user_id}` | Active interventions |

---

## 🎯 Hackathon Demo Tips

1. **Use Demo Login** - One click to access admin panel
2. **Simulate Calls** - Click phone icon in PaymentFlow to trigger call detection
3. **Test High-Risk** - Send large amounts (>₹10,000) to see AI intervention
4. **Known Scammer** - Use UPI ID containing "fake" or "scam" for critical alerts
5. **ML Observatory** - Show 5-model ensemble in admin panel

---

## 📞 Support

- 📧 Email: support@upisafeguard.com
- 📖 API Docs: http://localhost:8000/docs
- 🐛 Issues: GitHub Issues

---

<p align="center">
  <strong>Built for DeepBlue Hackathon 2025</strong>
</p>
