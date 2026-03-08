# UPI SafeGuard - AI-Powered Fraud Prevention Platform

<p align="center">
  <img src="frontend/public/shield.svg" alt="UPI SafeGuard" width="120" />
</p>

<p align="center">
  <strong>Real-time fraud detection that protects your money BEFORE you send it</strong>
</p>  

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue" alt="Python" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-green" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18+-61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/ML%20Models-5-orange" alt="ML Models" />
</p>

---

## 🛡️ Overview

UPI SafeGuard is a comprehensive fraud prevention platform that monitors UPI transactions in real-time using a **5-model ensemble architecture** working together to detect and prevent fraudulent transactions **BEFORE** they happen.

> **Note**: 4 of 5 ML models are **trained on the PaySim dataset** (6.3M synthetic financial transactions). The Sensor Stress Detector remains rule-based as it requires device sensor data not present in transaction datasets.

### 🌟 Key USP: AI Agentic Real-Time Intervention

Our **unique selling point** is the AI Agent that intervenes in real-time when fraud risk exceeds threshold:
- 🤖 Intelligent AI agent that analyzes transactions
- ⚡ Real-time WebSocket push for instant alerts
- 🎯 5 intervention levels (Advisory → Critical)
- 📚 Educational micro-learning during intervention
- 👨‍👩‍👧 Guardian notifications for high-risk transactions

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Demo Credentials](#-demo-credentials)
- [Features Overview](#-features-overview)
- [Admin Dashboard](#-admin-dashboard)
- [AI Intervention System](#-ai-intervention-system)
- [ML Models](#-ml-models)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Development Setup](#-development-setup)
- [Deployment](#-deployment)

---

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- (Optional) PostgreSQL 14+, MongoDB 6+, Redis 7+

### Demo Mode (No Database Required)

The application supports **SQLite fallback mode** for quick demos:

```bash
# 1. Clone and setup backend
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# 2. Start backend (auto-creates SQLite if PostgreSQL unavailable)
uvicorn app.main:app --reload --port 8000

# 3. In new terminal - setup frontend
cd frontend
npm install
npm run dev
```

### Access Application

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Frontend Application |
| http://localhost:8000 | Backend API |
| http://localhost:8000/docs | Swagger API Documentation |
| http://localhost:3000/admin/login | Admin Portal |

---

## 🔑 Demo Credentials

### User Login
- **Phone**: Any 10-digit number starting with 6-9 (e.g., `9876543210`)
- **OTP**: Sent via Twilio SMS if configured, otherwise shown in a demo modal
- In demo mode without Twilio, the OTP is displayed on-screen after requesting

### Admin Login
Access admin portal at `/admin/login`

| Method | Credentials |
|--------|-------------|
| **Demo Login Button** | Click "Demo Login" - auto-creates admin account |
| **Manual Login** | Email: `admin@upisafeguard.com` / Password: `admin123` |

> **Note**: Demo login auto-creates a Super Admin account if none exists.

---

## ✨ Features Overview

### User Features
| Feature | Description |
|---------|-------------|
| 🔍 **Smart Risk Assessment** | Real-time ML analysis before payment |
| 🚨 **AI Intervention** | Intelligent warnings for risky transactions |
| 👨‍👩‍👧 **Guardian Mode** | Family members can approve high-risk payments |
| 🎮 **Security Challenges** | Gamified learning with rewards |
| 📊 **Transaction History** | Complete payment history with risk scores |
| 🗣️ **Voice Alerts** | Warnings in 12 Indian languages |

### Admin Features
| Feature | Description |
|---------|-------------|
| 📈 **Dashboard** | Real-time stats, charts, and analytics |
| 👥 **User Management** | View/manage users, security scores |
| 🚨 **Fraud Reports** | Review and verify community reports |
| 🧠 **ML Observatory** | Monitor 5-model ensemble performance |
| 🖥️ **System Health** | Infrastructure monitoring |

---

## 👨‍💼 Admin Dashboard

### How Admin Sign-In Works

```
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN AUTH FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User navigates to /admin/login                          │
│                    │                                        │
│                    ▼                                        │
│  2. Two options available:                                  │
│     ┌─────────────────┐  ┌─────────────────────────┐       │
│     │  DEMO LOGIN     │  │   MANUAL LOGIN          │       │
│     │  (One-Click)    │  │   Email + Password      │       │
│     └────────┬────────┘  └───────────┬─────────────┘       │
│              │                       │                      │
│              ▼                       ▼                      │
│  3. Backend verifies credentials:                           │
│     - Demo: Creates admin if not exists                     │
│     - Manual: Validates against DB hash                     │
│                    │                                        │
│                    ▼                                        │
│  4. JWT Token Generated (12hr expiry)                       │
│     - Contains: admin_id, email, type="admin"               │
│                    │                                        │
│                    ▼                                        │
│  5. Token stored in localStorage (admin_token)              │
│     Admin object stored in Zustand state                    │
│                    │                                        │
│                    ▼                                        │
│  6. Redirect to /admin/dashboard                            │
│     - AdminRoute component checks auth                      │
│     - All API calls include Bearer token                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Admin Roles

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access, can create other admins |
| `admin` | Dashboard, user management, fraud reports |
| `analyst` | View-only access to analytics and ML models |
| `support` | User management and fraud reports only |

### Admin API Endpoints

```
POST /api/v1/admin/auth/login        - Login with email/password
POST /api/v1/admin/auth/demo-login   - One-click demo login
POST /api/v1/admin/auth/logout       - Logout and invalidate session
GET  /api/v1/admin/auth/me           - Get current admin info
POST /api/v1/admin/auth/create-first-admin - Bootstrap first admin
```

---

## 🤖 AI Intervention System

### How It Works

When a user initiates a payment, the AI agent:

1. **Analyzes** transaction through 5 ML models
2. **Calculates** aggregated risk score
3. **Determines** intervention level
4. **Triggers** appropriate response

### Intervention Levels

| Level | Risk Score | Response |
|-------|------------|----------|
| `none` | 0-30% | Transaction proceeds normally |
| `advisory` | 30-50% | Soft warning displayed |
| `warning` | 50-70% | Strong warning + verification required |
| `blocking` | 70-90% | Transaction blocked until verification |
| `critical` | 90-100% | Full block + guardian notification |

### Risk Factors Detected

- 🔴 Known scammer UPI ID
- 📱 Active phone call during transaction
- 😰 Stress indicators from device sensors
- 🕸️ Connection to fraud network (GNN)
- 📊 Behavioral anomaly (LSTM)
- 💰 Unusual transaction amount
- 🕐 Unusual transaction time
- ⚡ Rapid successive transactions

---

## 🧠 ML Models

### 5-Model Ensemble Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ML ENSEMBLE PIPELINE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Transaction Data ──┬──────────────────────────────────┐   │
│                     │                                   │   │
│    ┌────────────────▼────────────────┐                 │   │
│    │     Feature Engineering         │                 │   │
│    │   (50+ features extracted)      │                 │   │
│    └────────────────┬────────────────┘                 │   │
│                     │                                   │   │
│    ┌────────────────┼────────────────┐                 │   │
│    │                │                │                 │   │
│    ▼                ▼                ▼                 │   │
│ ┌──────┐      ┌──────────┐     ┌──────────┐           │   │
│ │XGBoost│      │  LSTM    │     │   GNN    │           │   │
│ │ Risk  │      │Behavioral│     │ Network  │           │   │
│ │Scorer │      │ Profiler │     │ Analysis │           │   │
│ └───┬───┘      └────┬─────┘     └────┬─────┘           │   │
│     │               │                │                 │   │
│     └───────────────┼────────────────┘                 │   │
│                     │                                   │   │
│    ┌────────────────┼────────────────┐                 │   │
│    ▼                ▼                ▼                 │   │
│ ┌──────────┐  ┌──────────┐                             │   │
│ │Isolation │  │ Sensor   │                             │   │
│ │ Forest   │  │ Stress   │                             │   │
│ │ Anomaly  │  │ Detector │                             │   │
│ └────┬─────┘  └────┬─────┘                             │   │
│      │             │                                   │   │
│      └─────────────┼───────────────────────────────────┘   │
│                    │                                       │
│    ┌───────────────▼───────────────┐                       │
│    │      Risk Aggregator          │                       │
│    │   (Weighted ensemble vote)    │                       │
│    └───────────────┬───────────────┘                       │
│                    │                                       │
│                    ▼                                       │
│    ┌───────────────────────────────┐                       │
│    │   AI Intervention Agent       │                       │
│    │ (Determines response action)  │                       │
│    └───────────────────────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Model Performance

Models are trained on the **PaySim Synthetic Financial Dataset** (6,362,620 transactions, 8,213 fraud cases). Training script: `backend/train_models.py`.

| Model | Type | What It Does | Training Metrics | Status |
|-------|------|-------------|-----------------|--------|
| XGBoost Risk Scorer | Gradient Boosted Trees (300 estimators) | Amount/time/balance risk scoring with 32 features | ROC-AUC: 0.9996, PR-AUC: 0.9865 | ✅ Trained |
| GNN Network Analysis | Transaction Graph (3.2M nodes) | Fraud network proximity via BFS on real transaction graph | 16,382 known fraud nodes mapped | ✅ Trained |
| LSTM Behavioral | Gradient Boosted Trees + Heuristic blend | User behavior deviation detection (70% trained / 30% heuristic) | ROC-AUC: 0.9984, PR-AUC: 0.8507 | ✅ Trained |
| Isolation Forest | Unsupervised Anomaly Detection (200 estimators) | Statistical outlier detection on 12 features | Fraud recall: 0.247, FPR: 0.005 | ✅ Trained |
| Sensor Stress | Rule-based | Device sensor stress detection (gyroscope, typing patterns) | N/A (no dataset) | Heuristic |

### Ensemble Weights

| Model | Weight | Confidence (trained) |
|-------|--------|---------------------|
| XGBoost | 30% | 0.95 |
| LSTM Behavioral | 25% | 0.90 |
| GNN Graph | 20% | 0.85 |
| Isolation Forest | 15% | 0.85 |
| Sensor Stress | 10% | 0.60 |

### Training the Models

```bash
cd backend
# Place PaySim CSV in backend/data/ (download from kaggle.com/datasets/ealaxi/paysim1)
python train_models.py
# Artifacts saved to backend/app/ml/trained_models/ (~230MB total)
```

---

## 📁 Project Structure

```
upi_Fraud_detection/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── admin.py           # Admin dashboard routes
│   │   │       ├── admin_auth.py      # Admin authentication
│   │   │       ├── ai.py              # AI chat / Groq LLM endpoint
│   │   │       ├── auth.py            # User authentication (OTP)
│   │   │       ├── challenge.py       # Security challenges & gamification
│   │   │       ├── contacts.py        # Contact lookup & UPI mapping
│   │   │       ├── fraud.py           # Fraud reporting
│   │   │       ├── guardian.py        # Guardian mode
│   │   │       ├── intervention.py    # AI intervention WebSocket
│   │   │       ├── notifications.py   # Push notifications
│   │   │       ├── security.py        # Security shield endpoints
│   │   │       ├── transaction.py     # Transaction processing
│   │   │       └── wallet.py          # Sandbox wallet management
│   │   ├── db/
│   │   │   ├── database.py            # DB connection (SQLite fallback)
│   │   │   ├── excel_database.py      # Excel lookup tables
│   │   │   ├── models.py              # SQLAlchemy models
│   │   │   └── mongodb_models.py      # MongoDB schemas (optional)
│   │   ├── ml/
│   │   │   ├── security_shield.py     # 7-layer security shield
│   │   │   ├── models/               # 5 ML model implementations
│   │   │   │   ├── xgboost_risk_scorer.py
│   │   │   │   ├── lstm_behavioral_profiler.py
│   │   │   │   ├── isolation_forest_anomaly.py
│   │   │   │   ├── graph_neural_network.py
│   │   │   │   └── sensor_stress_detector.py
│   │   │   ├── pipeline/             # Feature engineering & inference
│   │   │   │   ├── feature_engineering.py
│   │   │   │   ├── model_inference.py
│   │   │   │   ├── risk_aggregator.py
│   │   │   │   └── explanation_generator.py
│   │   │   └── trained_models/        # Trained .joblib artifacts
│   │   ├── services/
│   │   │   ├── ai_intervention_service.py  # Core AI agent
│   │   │   ├── fraud_detection_service.py  # Fraud detection logic
│   │   │   ├── groq_ai_service.py          # Groq LLM integration
│   │   │   ├── notification_service.py     # Notification delivery
│   │   │   ├── risk_assessment_service.py  # Risk assessment
│   │   │   ├── sandbox_bank.py             # Sandbox banking simulator
│   │   │   └── sms_service.py              # OTP SMS delivery
│   │   └── schemas/                   # Pydantic schemas
│   ├── data/                          # PaySim dataset & Excel lookups
│   ├── sandbox_data/                  # Demo wallet & transaction JSON
│   ├── train_models.py                # ML model training script
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts              # API client with admin support
│   │   ├── components/
│   │   │   ├── AIInterventionModal.tsx # AI intervention UI
│   │   │   ├── AdminRoute.tsx         # Protected admin routes
│   │   │   ├── ErrorBoundary.tsx      # React error boundary
│   │   │   ├── KillSwitch.tsx         # Environment threat detection
│   │   │   ├── LanguageBar.tsx        # Language selector (12 languages)
│   │   │   ├── Layout.tsx             # App layout with nav
│   │   │   ├── MyQRCode.tsx           # QR code generator
│   │   │   ├── NotificationBell.tsx   # Notification indicator
│   │   │   ├── ProtectedRoute.tsx     # Auth route guard
│   │   │   ├── QRScanner.tsx          # QR code scanner (camera)
│   │   │   ├── RiskGauge.tsx          # Risk score gauge visual
│   │   │   └── SecurityShieldVisualizer.tsx # 7-layer shield animation
│   │   ├── contexts/
│   │   │   └── TranslationContext.tsx  # Groq AI translation + TTS
│   │   ├── hooks/
│   │   │   └── useInterventionWebSocket.ts
│   │   ├── pages/
│   │   │   ├── AdminDashboard.tsx     # Admin analytics dashboard
│   │   │   ├── AdminFraudReports.tsx  # Fraud report management
│   │   │   ├── AdminLogin.tsx         # Admin authentication
│   │   │   ├── AdminMLModels.tsx      # ML model observatory
│   │   │   ├── AdminSystem.tsx        # System health monitor
│   │   │   ├── AdminUsers.tsx         # User management
│   │   │   ├── AIChat.tsx             # AI scam advisor chatbot
│   │   │   ├── Challenges.tsx         # Security challenges
│   │   │   ├── CommunityStats.tsx     # Community safety stats
│   │   │   ├── Dashboard.tsx          # User dashboard
│   │   │   ├── FraudReport.tsx        # Submit fraud report
│   │   │   ├── GuardianMode.tsx       # Guardian mode setup
│   │   │   ├── Landing.tsx            # Landing / splash page
│   │   │   ├── Login.tsx              # User OTP login
│   │   │   ├── PaymentFlowV2.tsx      # Payment with ML ensemble breakdown
│   │   │   ├── PrivacyPolicy.tsx      # Privacy policy page
│   │   │   ├── Profile.tsx            # User profile
│   │   │   ├── RiskAssessment.tsx     # Risk assessment view
│   │   │   ├── ScamEducation.tsx      # Scam education content
│   │   │   ├── Settings.tsx           # User settings
│   │   │   ├── TermsOfService.tsx     # Terms of service page
│   │   │   └── TransactionHistory.tsx # Transaction history
│   │   ├── services/
│   │   │   └── firebase.ts            # Firebase client (optional)
│   │   └── store/
│   │       └── index.ts               # Zustand stores
│   └── package.json
├── docs/                              # Generated ML accuracy charts
├── CREDENTIALS_GUIDE.md
├── DEMO_GUIDE.md
├── ML_MODEL_ACCURACY.md
├── PROJECT_ARCHITECTURE.md
└── README.md
```

---

## 🔧 Development Setup

### Backend Environment Variables

Create `backend/.env`:

```env
# Required
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256

# Database (Optional - falls back to SQLite)
POSTGRES_URL=postgresql+asyncpg://user:pass@localhost:5432/upi_safeguard
MONGODB_URL=mongodb://localhost:27017
REDIS_URL=redis://localhost:6379

# App Settings
APP_NAME="UPI SafeGuard"
APP_VERSION="2.0.0"
ENVIRONMENT=development
DEBUG=true
```

### Frontend Environment Variables

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000/api/v1
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

---

## 🚢 Deployment

### Docker Deployment

```bash
docker-compose up -d
```

### Cloud Options

| Platform | Recommended For |
|----------|-----------------|
| **Vercel + Supabase** | Quick demo deployment |
| **Railway** | Full-stack with databases |
| **AWS ECS** | Production scale |
| **Render** | Free tier available |

---

## 🔒 Security Notes

1. ✅ JWT tokens expire after 12 hours (admin) / 24 hours (user)
2. ✅ Passwords hashed with bcrypt
3. ✅ Admin routes protected with role-based access
4. ✅ Activity logging for audit trail
5. ✅ CORS configured for frontend origin only

---

## 📞 Support

- 📧 Email: support@upisafeguard.com
- 🐛 Issues: GitHub Issues
- 📖 Docs: `/docs` endpoint

---

## 📄 License

MIT License - see LICENSE file for details.

---

<p align="center">
  <strong>Built with ❤️ for DeepBlue Hackathon 2025</strong><br/>
  <em>Protecting India's digital payments with AI</em>
</p>
