# 🎯 Demo Guide — Triggering Critical / High Risk Scores

This guide shows exactly how to trigger every risk level during a live demo of the UPI SafeGuard app, including **critical**, **dangerous**, **blocked**, and high-risk scenarios that activate the **voice alert system**.

---

## Quick Reference — Risk Level Thresholds

| Score Range | Risk Level | Color  | Voice Alert? | Can Proceed? |
|-------------|-----------|--------|--------------|--------------|
| 0–25        | `safe`    | 🟢 Green  | No           | ✅ Yes       |
| 26–50       | `caution` | 🟡 Yellow | No           | ✅ Yes       |
| 51–75       | `risky`   | 🟠 Orange | ✅ Normal    | ⚠️ Warning first |
| 76–100      | `dangerous` | 🔴 Red | ✅ **Urgent** | ❌ "Go Back" shown |
| Blocklist   | `blocked` | 🔴 Red   | ✅ **Urgent** | ❌ Payment blocked entirely |

---

## 🔴 Scenario 1: BLOCKED — Hardcoded Blocklist (Highest Severity)

These UPI IDs are in the **hard blocklist** and will be **immediately blocked** with score 100/100.

### Steps:
1. Go to **Pay** page
2. Enter any of these UPI IDs:
   - `lottery.winner@scam`
   - `kyc.update@fake`
   - `cbi.officer@fraud`
   - `customer.care@fake`
   - `refund.process@scam`
3. Enter any amount (e.g., ₹500)
4. Tap **"Run Security Scan & Pay"**

### What happens:
- 7-layer animation runs, Layer 3 (Hard Rules) fails with 🔴
- Risk level: **BLOCKED** — score 100%
- 🔊 **Urgent voice alert** speaks: *"Warning! This transaction has been flagged as extremely dangerous..."*
- Voice plays even if voice toggle is OFF (critical safety override)
- Red "Scam Alert!" card shows with scam education info
- Only option: **"Don't Pay - Go Back"**
- Red pulsing voice banner appears at top while alert is speaking

---

## 🔴 Scenario 2: DANGEROUS — Known Scammer in Database

These UPI IDs exist in the **scammer database** and trigger a fraud alert at the UPI verification step.

### Steps:
1. Go to **Pay** page
2. Enter one of these UPI IDs and tap the **🔍 Verify** button:
   - `olx.seller@fraud` — Marketplace fraud (28 reports)
   - `amazon.refund@fake` — Refund scam (52 reports)
   - `paytm.support@scam` — Fake support (19 reports)
   - `bank.verify@phish` — Phishing (41 reports)
   - `investment.guru@scam` — Investment scam (58 reports)
   - `crypto.trader@fake` — Crypto scam (33 reports)
3. Or search by phone: `9999999901` through `9999999912`

### What happens:
- 🚨 **FRAUD ALERT** red banner appears immediately
- 🔊 **Urgent voice automatically speaks** the warning message
- "🔊 Hear Warning" button lets you replay the voice alert
- If you still proceed to security scan, scam type is identified and score > 75

---

## 🟠 Scenario 3: RISKY — Scam Keyword Detection

UPI IDs containing **scam keywords** trigger Layer 3 keyword analysis.

### Critical keywords (highest score boost, +35 each):
```
lottery, winner, prize, jackpot, cbi, arrest, police, customs
```

### High keywords (+20 each):
```
kyc, blocked, suspended, verify, update, urgent, official, support, helpdesk
```

### Medium keywords (+10 each):
```
refund, cashback, bonus, offer, free, gift
```

### Example UPI IDs to try:
| UPI ID | Expected Result |
|--------|----------------|
|l` | 🔴 Dangerous — lottery scam detected |
| `winner.prize@paytm` | 🔴 Dangerous — jackpot scam pattern |
| `cbi.department@icici` | 🔴 Dangerous — digital arrest scam |
| `kyc.verify@sbi` | 🟠 Risky — KYC fraud pattern |
| `official.support@hdfc` | 🟠 Risky — fake support pattern |
| `free.cashback@ybl` | 🟡 Caution — medium risk keywords |
| `john@paytm` | 🟢 Safe — no risk indicators |

### Steps:
1. Enter any keyword-laden UPI ID above
2. Enter a moderate amount (₹5,000–₹50,000 for added risk)
3. Tap **"Run Security Scan & Pay"**
4. Listen for the voice alert on risky/dangerous results

---

## 🟠 Scenario 4: HIGH AMOUNT Triggers

Large transaction amounts increase risk score regardless of recipient.

| Amount | Score Boost | Note |
|--------|-------------|------|
| ₹10,001–₹50,000 | +5 | "Moderate amount" warning |
| ₹50,001+ | +15 | "Large transaction" + `HIGH_AMOUNT` threat |
| ₹9,999 / ₹19,999 / ₹49,999 / ₹99,999 | +10 | "Just below limit" fraud pattern |

### Best combo for demo:
- UPI: `kyc.verify@sbi` + Amount: `₹75,000` → Risky + Large amount = **dangerous**
- UPI: `lottery2024@ybl` + Amount: `₹99,999` → Scam keyword + just-below-limit = **blocked level**

---

## 🔴 Scenario 5: Bank Name Spoofing

UPI IDs that impersonate bank support get +25 risk score.

### Pattern detected: `{bankname}.{official|support|care|help}`

### Examples:
| UPI ID | Risk Boost |
|--------|-----------|
| `sbi.official@ybl` | +25 — Bank spoofing detected |
| `hdfc.support@paytm` | +25 — Bank spoofing detected |
| `icici.care@sbi` | +25 — Bank spoofing detected |
| `axis.help@icici` | +25 — Bank spoofing detected |

Combine with amount > ₹50,000 for **dangerous** level.

---

## 🔴 Scenario 6: Environment Kill Switch (Layer 1)

If the device is detected running screen recording/sharing, **all payments are blocked**.

### In development mode:
1. On the **Pay** page, tap the floating **📞 phone icon** (bottom-right, dev mode only) to simulate an active call
2. This triggers call-detection risk boost
3. For full environment block, the Kill Switch component in the app detects:
   - Screen recording → 100% risk, payment blocked
   - Screen sharing (AnyDesk/TeamViewer) → 100% risk, payment blocked
   - Overlay attack → 80% risk, payment blocked

---

## 🟠 Scenario 7: Community Reports (Layer 6)

If a UPI ID has been reported by 10+ community members, it gets **auto-blocked**.

### How to demo:
1. Submit a fraud report from the **Report Fraud** page against a UPI like `test.scammer@ybl`
2. The community layer will flag any UPI with ≥10 reports
3. Pre-seeded scammer UPIs already have 19–67 reports each

---

## 🔊 Voice Alert Behavior Summary

| Event | Voice Type | Plays When Toggle is OFF? |
|-------|-----------|--------------------------|
| Scammer UPI detected (input step) | 🔴 **Urgent** | ✅ Yes — safety critical |
| Risk = dangerous/blocked (review step) | 🔴 **Urgent** | ✅ Yes — safety critical |
| Risk = risky (review step) | 🟠 Normal | ❌ Respects toggle |
| Risk = caution (review step) | 🟡 Normal | ❌ Respects toggle |
| Payment blocked (after submit) | 🔴 **Urgent** | ✅ Yes — safety critical |
| Guardian approval needed | 🟡 Normal | ❌ Respects toggle |
| "Listen to Risk Summary" button | Matches risk | ❌ Manual button |
| "Hear Warning" / "Hear This Alert" button | 🔴 **Urgent** | ✅ Yes — manual trigger |

### Voice features:
- **Urgent voice**: Slower rate (0.82×), higher pitch, max volume, red pulsing indicator
- **Normal voice**: Standard rate (0.9×), respects voice toggle setting
- **12 Indian languages** supported: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, Assamese
- Switch language from the **globe icon** (top-right) to hear alerts in regional language
- Non-English languages get Groq AI translated alerts before speaking

---

## 🎬 Recommended Demo Script (5 minutes)

### Part 1: Safe Transaction (30 sec)
1. Enter `john@paytm`, ₹500
2. Run scan → All green, score ~5% → Pay successfully
3. *"This is what a normal safe payment looks like."*

### Part 2: Scammer Detection (1 min)
1. Enter `lottery.winner@scam` in UPI field, tap verify
2. 🚨 FRAUD ALERT appears + 🔊 urgent voice speaks automatically
3. Show the "🔊 Hear Warning" button
4. *"The system detected a known scammer and immediately warned you with voice."*

### Part 3: Keyword Analysis (1 min)
1. Enter `cbi.department@icici`, ₹75,000
2. Run scan → Layers fail, score 85%+ → DANGEROUS
3. Red review screen, voice alert plays
4. Show "🔊 Listen to Risk Summary" button
5. *"Even for unknown UPIs, our AI detects scam patterns in the name itself."*

### Part 4: Regional Language (1 min)
1. Switch language to **Hindi** (हिंदी) from globe icon
2. Enter `kyc.update@fake`, ₹10,000
3. Run scan → Voice alert speaks in Hindi
4. *"The entire app — UI and voice alerts — works in 12 Indian languages."*

### Part 5: Blocked Payment (1 min)
1. Enter `refund.process@scam`, ₹50,000
2. Run scan → BLOCKED, score 100%
3. Only "Don't Pay" option available
4. Show Scam Alert card with "🔊 Hear This Alert"
5. *"For the most dangerous cases, payment is completely blocked — the user cannot proceed."*

---

## Testing Environment Notes

- **Backend**: `http://localhost:8000` — FastAPI
- **Frontend**: `http://localhost:3000` (or 3001 if 3000 is busy) — Vite React
- **Default demo user**: Phone `9876543210`, wallet balance ₹50,000
- **Voice works best in Chrome/Edge** (broadest TTS language support)
- **Mobile PWA**: Voice alerts also work on Android Chrome
- For non-English voice, select language **before** running the scan

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Voice not playing | Check browser TTS support: `speechSynthesis.getVoices()` in console |
| No Hindi/Tamil voice | Install language packs in OS Settings → Language |
| "Translating…" stuck | Check backend is running, Groq API key is valid |
| Scan always shows safe | Make sure backend is connected (`http://localhost:8000/docs`) |
| Scammer alert not showing | Verify Excel databases exist in `backend/app/data/` folder |
