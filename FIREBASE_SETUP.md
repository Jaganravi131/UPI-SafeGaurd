# 🔐 Firebase Phone Authentication Setup Guide (Optional)

> **⚠️ Firebase is NOT required to run this project.** The app falls back to demo mode automatically where OTPs are generated locally and displayed on-screen. Only set up Firebase if you want real SMS-based OTP delivery.

## Step-by-Step Setup (Optional — for production SMS)

### 1. Get Web API Key from Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `upi-fruad-detection`
3. Go to **Project Settings** (gear icon) → **General**
4. Scroll down to **Your apps** section
5. If no Web app exists, click **Add app** → **Web** (</> icon)
6. Give it a name like "UPI SafeGuard Web"
7. Copy the `firebaseConfig` values

### 2. Enable Phone Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click **Phone** and **Enable** it
3. Add your phone number to the testing whitelist (optional, for testing)

### 3. Add to Frontend Environment

Create file: `frontend/.env.local`

```env
VITE_FIREBASE_API_KEY=AIza...your-api-key...
VITE_FIREBASE_AUTH_DOMAIN=upi-fruad-detection.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=upi-fruad-detection
VITE_FIREBASE_STORAGE_BUCKET=upi-fruad-detection.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 4. Restart Frontend

```bash
cd frontend
npm run dev
```

## 🧪 Testing

1. Enter a real phone number (with country code +91)
2. Firebase will send an actual SMS
3. Enter the OTP received
4. You'll be logged in!

## 💡 Current Status

Your backend credentials are set up ✅
```
FIREBASE_PROJECT_ID=upi-fruad-detection
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@upi-fruad-detection.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=(set)
```

**Still needed:**
- [ ] Web API Key for frontend
- [ ] Enable Phone Auth in Firebase Console
- [ ] Create `.env.local` file

## 🔄 Fallback Mode

If Firebase is not configured, the app will automatically fall back to **demo mode** 
where OTPs are generated locally and shown on screen (not sent via SMS).
