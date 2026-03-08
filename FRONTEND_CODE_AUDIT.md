# Frontend Code Audit Report

**Scope:** All files under `frontend/src/`  
**Date:** 2025-02-20  
**Stack:** React 18 + TypeScript 5.3 + Vite 5 + Zustand + TanStack Query + TailwindCSS  

> **⚠️ Post-Audit Update:** Since this audit, PaymentFlowV2 now calls the real backend ML ensemble and displays per-model scores in an ML Ensemble Breakdown card. Some TypeScript errors and unused variables have been fixed. The app now has 23 pages and 12 components.

---

## Table of Contents

1. [Critical Security Issues](#1-critical-security-issues)
2. [Bugs](#2-bugs)
3. [Hardcoded Mock / Demo Data](#3-hardcoded-mock--demo-data)
4. [Fake UI Statistics](#4-fake-ui-statistics)
5. [Dead Code & Unused Variables](#5-dead-code--unused-variables)
6. [Non-functional UI Elements](#6-non-functional-ui-elements)
7. [TypeScript Safety Issues (`any` Usage, Missing Types)](#7-typescript-safety-issues-any-usage-missing-types)
8. [API & Error Handling Issues](#8-api--error-handling-issues)
9. [State Management Issues](#9-state-management-issues)
10. [Routing & Navigation Issues](#10-routing--navigation-issues)
11. [Accessibility Issues](#11-accessibility-issues)
12. [Auth Guard Gaps](#12-auth-guard-gaps)
13. [Miscellaneous Issues](#13-miscellaneous-issues)
14. [Per-File Summary](#14-per-file-summary)

---

## 1. Critical Security Issues

### 1.1 JWT Tokens Stored in `localStorage`
**Files:** `store/index.ts`, `api/client.ts`  
Both user and admin JWT tokens are stored in `localStorage` (via Zustand `persist` AND explicit `localStorage.setItem`). This is vulnerable to XSS attacks — any injected script can read these tokens. `device_id` is also stored in `localStorage`.

### 1.2 Demo Login Bypasses All Authentication
**File:** `pages/Login.tsx` (line ~155)  
`handleDemoLogin()` creates a fully hardcoded demo user with `id: 'demo-user-123'`, `token: 'demo-token-123'`, `phone: '+919876543210'`, `balance: 10000` and immediately marks the user as authenticated. This demo token is never validated by any backend. If shipped to production, any user can manually set these values and bypass auth entirely.

### 1.3 Admin Demo Login Exposed
**File:** `pages/AdminLogin.tsx` (line ~160)  
A "Demo Login (Hackathon Mode)" button calls `adminAuthAPI.demoLogin()` — if the backend endpoint exists in production, it allows unauthenticated admin access.

### 1.4 Firebase Config Fallback Contains Real Project IDs
**File:** `services/firebase.ts` (lines 17-24)  
Firebase config uses env vars with fallbacks to real project identifiers: `authDomain: "upi-fruad-detection.firebaseapp.com"`, `projectId: "upi-fruad-detection"`. These leak project info even when env vars are not set. Note the typo: "fruad" instead of "fraud".

### 1.5 `window.recaptchaVerifier` Stored on Global Window Object
**File:** `services/firebase.ts` (lines 39, 43)  
The reCAPTCHA verifier is stored/accessed via `(window as any).recaptchaVerifier`, making it accessible to any script on the page.

### 1.6 Console Logging in Production
**Files:** Multiple (`firebase.ts`, `useInterventionWebSocket.ts`, `QRScanner.tsx`, `SecurityShieldVisualizer.tsx`)  
Extensive `console.log` / `console.error` statements with sensitive data (phone numbers, OTP status, WebSocket URLs, QR data) that will appear in production browser consoles.

### 1.7 Hardcoded User Profile in Security Shield API Call
**File:** `components/SecurityShieldVisualizer.tsx` (lines 119-124)  
The security analysis API call sends hardcoded `user_profile` data:
```js
user_profile: {
  avg_transaction_amount: 1500,
  max_transaction_amount: 15000,
  transaction_count: 45,
  account_age_days: 200,
  security_score: 65
}
```
This means the security analysis never uses real user data.

### 1.8 Direct `fetch()` Bypasses Auth Interceptor
**File:** `components/SecurityShieldVisualizer.tsx` (line ~113)  
Uses raw `fetch()` instead of the axios client, bypassing the auth token interceptor. Also uses a separate `API_BASE` constant that can differ from the axios client's baseURL.

---

## 2. Bugs

### 2.1 All Transactions Mapped as 'debit'
**File:** `pages/TransactionHistory.tsx` (line ~72)  
```ts
type: t.amount < 0 ? 'debit' : 'debit'
```
Both branches of the ternary return `'debit'`. Credit transactions are never shown. This makes the "Received" filter tab always show 0 results.

### 2.2 KillSwitch DevTools Detection False Positives
**File:** `components/KillSwitch.tsx` (lines 119-126)  
DevTools detection uses `outerWidth - innerWidth > 160`, which will false-positive on:
- Browser sidebar panels (bookmarks, history)
- Browser DevTools in undocked mode
- Different window managers / scaled displays, etc.
This can lock users out of the payment flow unexpectedly.

### 2.3 `useEffect` Missing Dependencies (Timer Leak Risk)
**File:** `components/AIInterventionModal.tsx` (lines 113-124)  
The wait_period timer `useEffect` calls `handleChallengeResponse` but does not include it in the dependency array. Also accesses `currentChallenge` which changes by reference on re-renders.

### 2.4 `onCancel` in Auto-decline Timer Not Stable
**File:** `components/AIInterventionModal.tsx` (line ~107)  
The auto-decline `useEffect` depends on `onCancel` which is a prop — if the parent re-renders with a new function reference (no `useCallback`), the timer restarts.

### 2.5 WebSocket Reconnect Creates Infinite Loop Risk
**File:** `hooks/useInterventionWebSocket.ts`  
`connect` depends on `connectionAttempts` in its `useCallback` deps. When `connectionAttempts` changes, `connect` changes, which triggers the `useEffect` that calls `connect()`, potentially creating a reconnect loop even after a successful connection (since the effect re-runs).

### 2.6 SecurityShieldVisualizer Shows Random Placeholder Scores
**File:** `components/SecurityShieldVisualizer.tsx` (line ~153)  
During the animation phase, placeholder results use `Math.random() * 30` for risk scores. These random values flash briefly before real data loads, giving inconsistent visual feedback.

---

## 3. Hardcoded Mock / Demo Data

### 3.1 Demo User in Login
**File:** `pages/Login.tsx`
- User: `id: 'demo-user-123'`, `name: 'Demo User'`, `phone: '+919876543210'`, `balance: 10000`, `security_score: 75`
- Token: `'demo-token-123'`
- Hardcoded demo OTP: `'123456'`

### 3.2 Simulated Bank Detection
**File:** `pages/Login.tsx`
- Bank detection step is 100% simulated with `setTimeout(4000)`
- Fake detected bank data: `name: 'State Bank of India'`, `upiId: phone-based@ybl`, `balance: 10000`, `linked: true`
- Text: "Your account will be created with ₹10,000 sandbox balance"

### 3.3 Admin Dashboard Fallback Data
**File:** `pages/AdminDashboard.tsx` (lines ~98-110)
- Fallback on API failure: `total_users: 1247`, `active_users: 892`, `total_transactions: 15632`, `fraud_detected: 47`, `fraud_prevented: 43`, etc.
- Hardcoded trend percentages in StatCard: `+12%`, `+8%`, `+2%`

### 3.4 Admin System Health Fallback
**File:** `pages/AdminSystem.tsx` (lines ~76-115)
- Hardcoded system metrics: CPU `45%`, Memory `62%`, Disk `38%`, Network `23ms`
- Hardcoded services: `ml_engine`, `database`, `api_gateway`, `websocket`, `notification_service` — all with hardcoded statuses, uptimes, and response times
- Hardcoded activity logs with January 2026 timestamps
- Services are set to `status: 'healthy'` by default, masking real health

### 3.5 Admin Fraud Reports Local Fallback
**File:** `pages/AdminFraudReports.tsx` (line ~190)
- `handleUpdateStatus` has comment "For demo, just update locally" and only updates local state instead of making API call on failure

### 3.6 Scam Education Static Content
**File:** `pages/ScamEducation.tsx`
- Large `SCAM_CONTENT` Record with hardcoded Indian statistics (victim counts, loss amounts), used as fallback
- Hardcoded quiz with static answer ("B) Hang up and call bank's official number")

### 3.7 Demo Intervention System
**File:** `hooks/useInterventionWebSocket.ts`
- `useDemoIntervention()` hook generates completely fake `AIIntervention` objects with hardcoded messages, challenges, and scoring
- Fake scam examples: "₹3.2 lakh", "₹45 lakh in losses across India"

### 3.8 KillSwitch Demo Component
**File:** `components/KillSwitch.tsx`
- `KillSwitchDemo` component simulates threats (screen recording, AnyDesk, overlay) with hardcoded messages
- `[Demo Mode: Click to dismiss]` button text in the alert

### 3.9 Call Simulation Toggle
**File:** `pages/PaymentFlowV2.tsx` (bottom)
- Floating button to toggle `isOnCall` state for demo purposes
- Label: "Toggle call simulation (for demo)"

### 3.10 Guardian Mode Hardcoded Threshold
**File:** `pages/GuardianMode.tsx`
- `approval_threshold: 5000` hardcoded in guardian setup call

---

## 4. Fake UI Statistics

### 4.1 Landing Page Marketing Numbers
**File:** `pages/Landing.tsx`
- `94.2%` Detection Rate — static, not computed
- `<2s` Response Time — static
- `50+` Scam Patterns — static
- `99%` User Trust — static
- `"Hackathon Project 2024"` in footer

### 4.2 Dashboard Hardcoded Check
**File:** `pages/Dashboard.tsx`
- Checks for `user?.id === 'demo-user-123'` to skip session validation
- If the demo check matches, it doesn't validate the session at all

### 4.3 Settings Page Static Values
**File:** `pages/Settings.tsx`
- Transaction limit displayed as `₹50,000/day` — hardcoded, not from API

---

## 5. Dead Code & Unused Variables

| File | Variable/Code | Notes |
|------|--------------|-------|
| `pages/Dashboard.tsx` | `_sessionValid` | Set but never read (underscore prefix) |
| `pages/Dashboard.tsx` | `_isDemo` | Set but never read |
| `pages/Login.tsx` | `_isDemo` | Set but never read |
| `pages/Login.tsx` | `_suggested_upi_id` | Set but never read |
| `pages/Profile.tsx` | `_loading` | Set but never read |
| `components/QRScanner.tsx` | `_scanning` | Set but never read |
| `components/AIInterventionModal.tsx` | `showEducation` state | Initialized but the education toggle works; however, the empty `useEffect` on line ~133 for playing alert sound does nothing |
| `components/SecurityShieldVisualizer.tsx` | Unused imports: `ShieldAlert` | Imported but not used in the component |

---

## 6. Non-functional UI Elements

### 6.1 Settings Page — Security Section
**File:** `pages/Settings.tsx`
- "Change PIN" → Toast: "PIN change will be available in the next update"
- "Biometric Login" → Toast: same message
- "Transaction Limit" → Toast: same message
- Privacy Policy link → does nothing
- Terms of Service link → does nothing

### 6.2 Admin Users Page
**File:** `pages/AdminUsers.tsx`
- "Export" button → no click handler
- "Filters" button → no click handler  
- ✏️ "Edit" pencil icon per user → no click handler

### 6.3 Admin ML Models Page
**File:** `pages/AdminMLModels.tsx`
- "Save Changes" button in config modal → just closes modal, doesn't save anything
- Model weight slider → value changes locally but never persisted

### 6.4 Admin System Health Page
**File:** `pages/AdminSystem.tsx`
- Service "Restart" buttons → no `onClick` handlers
- Log level filter `<select>` → no `onChange` handler
- "View Dashboard" link → no actual link destination

### 6.5 Landing Page Footer
**File:** `pages/Landing.tsx`
- Privacy Policy, Terms of Service, Contact → `<span>` elements with `cursor-pointer` but no navigation or click handlers

### 6.6 Login Page Footer
**File:** `pages/Login.tsx`
- "Terms of Service" and "Privacy Policy" → `<span>` with `cursor-pointer`, no actual links

### 6.7 Fraud Report Evidence Upload
**File:** `pages/FraudReport.tsx`
- Evidence files captured as `File` objects but only filenames sent to API: `evidence_urls: evidenceFiles.map(f => f.name)`
- No actual file upload — backend only receives names like `"screenshot.png"`, not the file data

### 6.8 Admin Fraud Reports Search
**File:** `pages/AdminFraudReports.tsx`
- Search input with `searchQuery` state exists but the value is never sent to the `fetchReports` API call — search is purely cosmetic filtering

---

## 7. TypeScript Safety Issues (`any` Usage, Missing Types)

| File | Location | Issue |
|------|----------|-------|
| `api/client.ts` | `interventionAPI.check` | `transaction_data: any` parameter |
| `pages/RiskAssessment.tsx` | `assessment` state | Typed as `any` |
| `pages/RiskAssessment.tsx` | API response mapping | Multiple `.map((r: any) => ...)` and `.map((t: any) => ...)` |
| `pages/Profile.tsx` | Badge mapping | `.map((b: any) => ...)` |
| `components/QRScanner.tsx` | `handleScan` param | `result: any` — should be typed to scanner library's type |
| `components/QRScanner.tsx` | `handleError` param | `error: any` |
| `components/SecurityShieldVisualizer.tsx` | `import.meta` | `(import.meta as any).env` — unnecessary, Vite types handle this |
| `services/firebase.ts` | reCAPTCHA | `(window as any).recaptchaVerifier` used in 4 places |
| `services/firebase.ts` | Error handling | `error: any` in both `sendOTP` and `verifyOTP` |

---

## 8. API & Error Handling Issues

### 8.1 Silent Error Swallowing
| File | Method | Issue |
|------|--------|-------|
| `pages/GuardianMode.tsx` | `fetchData()` | Catches errors silently, only logs to console |
| `pages/Dashboard.tsx` | Session validation | Errors caught, fallback to demo, no user notification |
| `pages/Challenges.tsx` | `completeChallengeAPI` | When API fails, still marks challenge as complete locally |
| `pages/AdminDashboard.tsx` | `fetchDashboardData` | Falls back to fake data silently |
| `pages/AdminSystem.tsx` | `fetchSystemData` | Falls back to extensive fake data silently |

### 8.2 No Global Error Boundary
**File:** `App.tsx`  
There is no React Error Boundary wrapping the application. Any unhandled render error will crash the entire app with a white screen.

### 8.3 API Client Response Interceptor Redirect
**File:** `api/client.ts` (line ~35)  
On 401 responses, the interceptor does `window.location.href = '/login'` — a full page reload. This destroys all in-memory state and should use React Router's `navigate` instead.

### 8.4 Missing Loading/Error States
- `pages/RiskAssessment.tsx` — No loading spinner while fetching (only shows "Loading risk assessment..." text)
- Multiple admin pages show demo data on error rather than error states

---

## 9. State Management Issues

### 9.1 Redundant Token Storage
**File:** `store/index.ts`  
Tokens are stored in:
1. Zustand persist store → `localStorage['auth-storage']`
2. Explicit `localStorage.setItem('token', token)` in `setAuth`
3. `localStorage.setItem('admin_token', ...)` in `setAdminAuth`

This creates desync risk — if one is cleared without the other, auth state becomes inconsistent.

### 9.2 Transaction Store Not Persisted
**File:** `store/index.ts`  
`useTransactionStore` has no `persist` middleware, so transaction history is lost on page refresh. This is by design but means navigating away and back always triggers a re-fetch.

### 9.3 Challenge Completion Lost on Unmount
**File:** `pages/Challenges.tsx`  
`completedIds` is stored in component state only. If the user navigates away and returns, all completed challenges appear incomplete again.

### 9.4 Admin Store Missing Logout Cleanup
**File:** `store/index.ts`  
`adminLogout` clears the admin store and `localStorage.removeItem('admin_token')`, but does not clear the user auth store. Cross-contamination is possible if both user and admin sessions exist simultaneously.

---

## 10. Routing & Navigation Issues

### 10.1 `<a href>` Instead of `<Link>`
**File:** `pages/CommunityStats.tsx`  
Uses `<a href="/report">` in the CTA section, causing a full page reload instead of client-side navigation.

### 10.2 `<a href>` in SecurityReasonsCard
**File:** `components/SecurityShieldVisualizer.tsx` (line ~389)  
Education link uses `<a href={analysis.education_link}>` instead of React Router `<Link>`, causing full page reload.

### 10.3 Route `/pay` Not Defined
**File:** `App.tsx`  
The `/pay` route renders `PaymentFlowV2`, but the `Layout` bottom nav has a "Pay" button linking to `/pay` — this works, but no route exists for the old `PaymentFlow` component (it's imported nowhere). The `PaymentFlow.tsx` file exists but is unused.

### 10.4 Notification Sound File May Not Exist
**File:** `pages/AdminFraudReports.tsx`  
`new Audio('/notification.mp3')` — this file must exist in `public/`. If missing, the audio creation silently fails but could cause console errors. No check for file existence.

---

## 11. Accessibility Issues

### 11.1 Missing ARIA Labels — Global
Nearly all interactive elements across the entire codebase lack:
- `aria-label` on icon-only buttons (especially in `Layout.tsx`, all admin pages)
- `role` attributes on custom interactive components
- `aria-live` regions for dynamic status updates
- Screen reader text for icon-only navigation items

### 11.2 Specific Accessibility Gaps
| File | Element | Issue |
|------|---------|-------|
| `components/Layout.tsx` | Bottom nav icon buttons | No `aria-label` — screen readers see empty buttons |
| `components/KillSwitch.tsx` | Alert modal | No `role="alertdialog"` or `aria-modal` |
| `components/AIInterventionModal.tsx` | Modal | No `role="dialog"`, no focus trap |
| `components/QRScanner.tsx` | Scanner view | No screen reader announcements for scan results |
| `components/RiskGauge.tsx` | SVG gauge | No `aria-label` on SVG, risk score not announced |
| `pages/PaymentFlowV2.tsx` | Quick amount buttons | No `aria-pressed` state |
| Multiple pages | Color-only indicators | Risk badges use color alone (red/yellow/green) without text alternatives |

### 11.3 No Keyboard Navigation Support
- Modals don't trap focus (KillSwitch, AIIntervention, QRScanner)
- No Escape key handler to close modals (except QRScanner partial)
- Tab order not managed in multi-step flows (Login, PaymentFlowV2)

---

## 12. Auth Guard Gaps

### 12.1 AdminRoute `allowedRoles` Never Used
**File:** `components/AdminRoute.tsx` vs `App.tsx`  
`AdminRoute` accepts an optional `allowedRoles` prop with role-based access control logic, but `App.tsx` never passes `allowedRoles` to any admin route. Every admin route is accessible to any admin user.

### 12.2 ProtectedRoute Overly Simple
**File:** `components/ProtectedRoute.tsx`  
Only checks `isAuthenticated` boolean from Zustand. Does not verify:
- Token expiry
- Token validity (no backend validation)
- If the demo token `'demo-token-123'` is being used

### 12.3 No Route-Level Permission Checks
Admin pages like ML Models, System Health, and User Management all have the same `AdminRoute` guard. No granular permissions for different admin roles (viewer, manager, superadmin).

---

## 13. Miscellaneous Issues

### 13.1 Copyright Date Issues
| File | Value | Issue |
|------|-------|-------|
| `pages/Settings.tsx` | `© 2025 UPI SafeGuard` | Outdated |
| `pages/Landing.tsx` | `© 2024 UPI SafeGuard` | Outdated |
| `pages/Landing.tsx` | `"Hackathon Project 2024"` | Reveals project is a hackathon demo |

### 13.2 Firebase Project Typo
**File:** `services/firebase.ts`  
Project ID is `"upi-fruad-detection"` — "fruad" should be "fraud".

### 13.3 External Dependency Risk — QR Scanner
**File:** `components/QRScanner.tsx`  
Depends on `@yudiel/react-qr-scanner` — a lower-popularity package. No fallback if the library fails to load.

### 13.4 Inline Styles Mixed with Tailwind
**Files:** `SecurityShieldVisualizer.tsx`, `QRScanner.tsx`  
Some components mix Tailwind classes with the `styles` prop on third-party components, creating maintenance inconsistency.

### 13.5 No Environment Variable Validation
**Files:** `services/firebase.ts`, `components/SecurityShieldVisualizer.tsx`  
Environment variables are used with fallbacks, but there's no startup validation that critical env vars (API URL, Firebase keys) are properly configured.

### 13.6 Notification Sound Side Effect
**File:** `pages/AdminFraudReports.tsx`  
Auto-plays `notification.mp3` when new fraud reports arrive — no user preference check, no volume control, no browser autoplay policy handling.

### 13.7 Large Bundle Risk
**File:** `package.json`  
Heavy dependencies without code splitting: `framer-motion`, `recharts`, `firebase`, `@yudiel/react-qr-scanner`. No lazy loading of route components in `App.tsx`.

---

## 14. Per-File Summary

### `src/main.tsx`
- ✅ Clean setup
- ⚠️ No Error Boundary wrapping `<App />`

### `src/App.tsx`
- ✅ Clean routing structure
- ⚠️ No lazy loading / code splitting for routes
- ⚠️ `AdminRoute` `allowedRoles` never used

### `src/index.css`
- ✅ Clean Tailwind configuration
- ℹ️ Custom component classes (`.btn-primary`, `.card-glass`, etc.) — well structured

### `src/api/client.ts`
- 🔴 Tokens from `localStorage`
- 🔴 401 handler uses `window.location.href` (full page reload)
- ⚠️ `any` type in `interventionAPI.check`

### `src/store/index.ts`
- 🔴 Redundant token storage (Zustand persist + explicit localStorage)
- ⚠️ Admin logout doesn't clear user store
- ⚠️ `device_id` generated with `Math.random()` (not cryptographically secure)

### `src/services/firebase.ts`
- 🔴 Hardcoded Firebase project IDs as fallbacks
- 🔴 `(window as any).recaptchaVerifier` — global scope pollution
- ⚠️ Typo: "fruad" in project ID
- ⚠️ Console logging with user phone numbers

### `src/pages/Landing.tsx`
- ⚠️ Static fake marketing statistics
- ⚠️ Non-functional footer links (Privacy, Terms, Contact)
- ⚠️ "Hackathon Project 2024" visible in footer
- ⚠️ Copyright "© 2024"

### `src/pages/Login.tsx`
- 🔴 Demo login with hardcoded user/token bypasses auth
- 🔴 Demo OTP `'123456'` displayed in modal
- ⚠️ Bank detection 100% simulated
- ⚠️ `_isDemo`, `_suggested_upi_id` unused
- ⚠️ Non-functional Terms/Privacy links
- ⚠️ "₹10,000 sandbox balance" text visible

### `src/pages/Dashboard.tsx`
- ⚠️ Hardcoded `demo-user-123` check
- ⚠️ `_sessionValid`, `_isDemo` unused vars

### `src/pages/PaymentFlowV2.tsx`
- ⚠️ `isOnCall` state only toggleable via demo button — not connected to real call detection
- ⚠️ Demo call toggle button with "for demo" text visible at bottom-right
- ⚠️ No input sanitization on UPI ID field
- ✅ Good 7-layer security visualization
- ✅ Proper balance checking with `insufficientBalance` guard

### `src/pages/TransactionHistory.tsx`
- 🔴 BUG: All transactions mapped as `'debit'` (both ternary branches identical)
- ✅ Good filter/search UI

### `src/pages/RiskAssessment.tsx`
- ⚠️ Heavy `any` usage for API response
- ⚠️ Fallback assessment with `risk_score: 0` may mislead

### `src/pages/GuardianMode.tsx`
- ⚠️ Errors silently swallowed in `fetchData`
- ⚠️ Hardcoded `approval_threshold: 5000`

### `src/pages/Challenges.tsx`
- ⚠️ `completedIds` lost on component unmount
- ⚠️ Challenge completion marked locally even on API failure

### `src/pages/FraudReport.tsx`
- 🔴 Evidence upload sends only filenames, no actual file data

### `src/pages/CommunityStats.tsx`
- ⚠️ `<a href="/report">` instead of `<Link>` (full reload)

### `src/pages/Profile.tsx`
- ⚠️ `_loading` unused variable
- ⚠️ Badge mapping uses `any` type

### `src/pages/Settings.tsx`
- ⚠️ Security options (PIN, Biometric, Transaction Limit) are all stubs
- ⚠️ Hardcoded `₹50,000/day` limit display
- ⚠️ Non-functional Privacy Policy / Terms buttons
- ⚠️ Copyright "© 2025"

### `src/pages/ScamEducation.tsx`
- ⚠️ Large hardcoded `SCAM_CONTENT` fallback with Indian statistics
- ⚠️ Quiz answer is hardcoded (always option B)

### `src/pages/AdminDashboard.tsx`
- 🔴 Falls back to hardcoded fake stats silently on API failure
- ⚠️ Hardcoded trend percentages (+12%, +8%, etc.)

### `src/pages/AdminLogin.tsx`
- 🔴 "Demo Login (Hackathon Mode)" button
- ⚠️ No rate limiting on login attempts (client-side)

### `src/pages/AdminUsers.tsx`
- ⚠️ Non-functional Export, Filters, Edit buttons

### `src/pages/AdminFraudReports.tsx`
- ⚠️ Search query not sent to API
- ⚠️ Local-only status update fallback ("For demo")
- ⚠️ Auto-plays notification sound without user consent

### `src/pages/AdminMLModels.tsx`
- ⚠️ "Save Changes" button doesn't save
- ⚠️ Model weight slider changes are ephemeral

### `src/pages/AdminSystem.tsx`
- 🔴 Extensive hardcoded fallback: metrics, services, logs with fake dates (Jan 2026)
- ⚠️ Restart buttons have no onClick handlers
- ⚠️ Log level filter has no onChange handler

### `src/pages/NotFound.tsx`
- ✅ Clean implementation

### `src/components/Layout.tsx`
- ⚠️ No aria-labels on bottom nav icon buttons

### `src/components/ProtectedRoute.tsx`
- ⚠️ Only checks `isAuthenticated` boolean — no token validation

### `src/components/AdminRoute.tsx`
- ⚠️ `allowedRoles` prop implemented but never used

### `src/components/KillSwitch.tsx`
- ⚠️ DevTools detection has false-positive risk (window size heuristic)
- ⚠️ Screen recording/sharing detection is mostly stubbed (comments say "real implementation would use native APIs")
- ⚠️ `[Demo Mode: Click to dismiss]` visible in alert
- ⚠️ No `role="alertdialog"` on the modal

### `src/components/AIInterventionModal.tsx`
- ⚠️ `useEffect` dependency arrays may be incomplete (wait_period timer)
- ⚠️ Sound playback `useEffect` is empty (does nothing)
- ⚠️ No focus trap in modal
- ✅ Good progressive challenge system design

### `src/components/SecurityShieldVisualizer.tsx`
- 🔴 Uses raw `fetch()` bypassing auth interceptor
- 🔴 Hardcoded user_profile in API request
- ⚠️ `(import.meta as any).env` unnecessary cast
- ⚠️ Random placeholder scores during animation
- ⚠️ Education link uses `<a href>` instead of React Router `<Link>`

### `src/components/QRScanner.tsx`
- ⚠️ `_scanning` state unused
- ⚠️ `any` type for scan result and error params
- ⚠️ Console.log of raw QR data
- ✅ Good UPI URL parsing logic

### `src/components/RiskGauge.tsx`
- ✅ Clean SVG implementation
- ⚠️ No `aria-label` on SVG element

### `src/hooks/useInterventionWebSocket.ts`
- ⚠️ Potential reconnect loop due to `connectionAttempts` in `useCallback` deps
- ⚠️ Console.log of WebSocket messages
- ✅ Good exponential backoff and heartbeat implementation

---

## Summary Counts

| Severity | Count |
|----------|-------|
| 🔴 Critical (Security/Bugs) | 12 |
| ⚠️ Warning (Demo data, dead code, non-functional UI) | 55+ |
| ✅ Clean / Well-implemented | ~8 components/features |

**Top 5 Priority Fixes:**
1. Remove all demo login / hardcoded token bypass mechanisms before production
2. Fix TransactionHistory `'debit'`/`'debit'` bug
3. Migrate from `localStorage` token storage to httpOnly cookies
4. Add a React Error Boundary
5. Remove/gate all hardcoded fallback data behind an explicit `DEMO_MODE` environment variable
