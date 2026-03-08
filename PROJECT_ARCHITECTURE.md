# UPI SafeGuard - Project Architecture Documentation

## Overview
UPI SafeGuard is a fraud detection and prevention system for UPI payments. This document explains the data architecture, database providers, and business logic.

---

## 📊 Data Storage Architecture

### 1. **SQLite Database** (`demo_database.db`)
**Purpose:** Primary relational database for user and transaction data

**Tables:**
- `users` - User accounts, profiles, security scores
- `transactions` - Payment transactions with risk scores
- `fraud_reports` - User-submitted fraud reports
- `guardians` - Guardian mode relationships
- `challenges` - Security awareness challenges
- `challenge_progress` - User progress on challenges
- `admins` - Admin user accounts
- `activity_logs` - Admin action logs
- `notifications` - User notifications
- `upi_profiles` - UPI ID profiles and verification

**When Updated:**
- User registration/login
- Every transaction
- Fraud report submissions
- Guardian mode setup

---

### 2. **Excel Files** (`backend/data/`)
**Purpose:** Lookup tables and reference data for ML models

**Files:**
| File | Purpose |
|------|---------|
| `phone_upi_mapping.xlsx` | Maps phone numbers to UPI IDs for contact lookup |
| `known_scammers.xlsx` | Blacklist of reported scammer UPI IDs |
| `merchant_whitelist.xlsx` | Verified trusted merchants |
| `risk_patterns.xlsx` | Known fraud patterns for ML matching |

**When Updated:**
- On startup (loaded into memory)
- Admin can update via Excel file replacement
- NOT auto-updated by user actions

---

### 3. **Sandbox Banking** (`backend/sandbox_data/`)
**Purpose:** Demo/testing fake bank accounts (NOT connected to real banks)

**Files:**
| File | Purpose |
|------|---------|
| `wallets.json` | User wallet balances |
| `transactions.json` | Sandbox transaction history |

**When Updated:**
- User registration (creates wallet with ₹10,000)
- Money transfers in sandbox mode
- Demo transactions

**Note:** This is ONLY for hackathon demo purposes. In production, this would connect to actual bank APIs.

---

### 4. **MongoDB** (Optional - Cloud)
**Purpose:** High-volume behavioral analytics and ML feature storage

**Collections:**
- `behavior_patterns` - User typing patterns, session data
- `transaction_velocity` - Real-time transaction frequency tracking
- `ml_predictions` - Cached ML model outputs
- `scam_trends` - Aggregated scam pattern data

**When Updated:**
- Every transaction (async background task)
- ML model predictions
- Behavioral analysis

**Note:** Falls back gracefully if MongoDB not available.

---

### 5. **Redis** (Optional - Cache)
**Purpose:** Session management and real-time rate limiting

**Keys:**
- `session:{user_id}` - Active user sessions
- `rate_limit:{phone}` - OTP rate limiting
- `risk_cache:{txn_id}` - Cached risk assessments

**Note:** Falls back gracefully if Redis not available.

---

## 🔐 Authentication Flow

### Demo Mode (Current)
1. User enters phone number
2. Backend generates random 6-digit OTP (shown on screen in demo mode)
3. User enters OTP → verified against in-memory store
4. If new user → Registration form
5. If existing user → Dashboard

### Single Device Session
- Each login generates unique `session_id` in JWT
- New login invalidates previous session
- Dashboard checks session every 30 seconds
- **Skip for demo accounts** (id: `demo-user-123`)

---

## 🎮 Demo Account
```
Phone: 9876543210
OTP: (shown on screen)
Balance: ₹10,000
```
Or click "Try Demo Account" button for instant access.

---

## 📁 File Structure

```
backend/
├── app/
│   ├── api/routes/       # API endpoints (13 route files)
│   │   ├── admin.py, admin_auth.py, ai.py, auth.py
│   │   ├── challenge.py, contacts.py, fraud.py
│   │   ├── guardian.py, intervention.py, notifications.py
│   │   ├── security.py, transaction.py, wallet.py
│   ├── db/               # Database models & connection
│   │   ├── database.py, excel_database.py
│   │   ├── models.py, mongodb_models.py
│   ├── ml/               # Machine learning models
│   │   ├── security_shield.py  # 7-layer security shield
│   │   ├── models/        # 5 ML model implementations
│   │   ├── pipeline/      # Feature engineering & inference
│   │   └── trained_models/ # .joblib artifacts
│   ├── services/          # Business logic services
│   │   ├── ai_intervention_service.py
│   │   ├── fraud_detection_service.py
│   │   ├── groq_ai_service.py
│   │   ├── notification_service.py
│   │   ├── risk_assessment_service.py
│   │   ├── sandbox_bank.py
│   │   └── sms_service.py
│   └── schemas/           # Pydantic validation schemas
├── data/                  # Excel lookup files & PaySim CSV
├── sandbox_data/          # Demo banking data (JSON)
├── train_models.py        # ML model training script
└── demo_database.db       # SQLite database (auto-created)

frontend/
├── src/
│   ├── api/              # API client
│   ├── components/       # 12 reusable UI components
│   ├── contexts/         # Translation + TTS context
│   ├── hooks/            # WebSocket hooks
│   ├── pages/            # 23 page components
│   ├── services/         # Firebase service
│   └── store/            # Zustand state management
```

---

## 🚀 Running the Project

### Backend
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm run dev
```

---

## ⚠️ Known Simplifications for Hackathon

1. **No real SMS** - OTP shown on screen (Firebase requires paid plan)
2. **No real banking** - Sandbox JSON files simulate bank balance
3. **SQLite instead of PostgreSQL** - Simpler setup
4. **In-memory sessions** - Would use Redis in production
5. **Excel files** - Would use database tables in production

---

## 🔄 Data Flow Summary

```
User Action → Frontend → API → SQLite (primary)
                              ↓
                         MongoDB (analytics)
                              ↓
                         Sandbox JSON (demo balance)
                              ↓
                         Excel (lookups - read only)
```
