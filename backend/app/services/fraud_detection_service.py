"""
Real-time Fraud Detection Service
Core fraud detection logic for UPI transactions
"""
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    SAFE = "safe"
    CAUTION = "caution"
    RISKY = "risky"
    DANGEROUS = "dangerous"


class AlertType(str, Enum):
    HIGH_AMOUNT = "high_amount"
    UNKNOWN_RECIPIENT = "unknown_recipient"
    UNUSUAL_TIME = "unusual_time"
    RAPID_TRANSACTIONS = "rapid_transactions"
    KNOWN_SCAMMER = "known_scammer"
    FIRST_TIME_RECIPIENT = "first_time_recipient"
    LOCATION_MISMATCH = "location_mismatch"
    DEVICE_CHANGE = "device_change"
    SCAM_KEYWORDS = "scam_keywords"
    SUSPICIOUS_PATTERN = "suspicious_pattern"
    AI_INTERVENTION_REQUIRED = "ai_intervention_required"
    BEHAVIORAL_ANOMALY = "behavioral_anomaly"


@dataclass
class FraudAlert:
    alert_type: AlertType
    severity: str  # low, medium, high, critical
    message: str
    details: Dict[str, Any]


@dataclass
class TransactionAnalysis:
    risk_score: float  # 0-100
    risk_level: RiskLevel
    alerts: List[FraudAlert]
    action: str  # allow, delay, require_verification, block
    explanations: List[str]
    model_scores: Dict[str, float]


class FraudDetectionService:
    """
    Real-time fraud detection for UPI transactions
    
    Features:
    - Rule-based fraud detection
    - NLP-based scam keyword detection
    - Behavioral profiling
    - Transaction pattern analysis
    - AI intervention triggers
    - Real-time alerts
    """
    
    # Thresholds (configurable)
    HIGH_AMOUNT_THRESHOLD = 10000  # INR
    VERY_HIGH_AMOUNT_THRESHOLD = 50000  # INR
    RAPID_TXN_WINDOW_MINUTES = 5
    RAPID_TXN_COUNT_THRESHOLD = 3
    UNUSUAL_HOUR_START = 23  # 11 PM
    UNUSUAL_HOUR_END = 6  # 6 AM
    
    # Scam keyword patterns (NLP-based detection)
    SCAM_KEYWORDS = {
        # Lottery/Prize scams
        "lottery": {"severity": "critical", "category": "lottery_scam"},
        "winner": {"severity": "critical", "category": "lottery_scam"},
        "prize": {"severity": "critical", "category": "lottery_scam"},
        "jackpot": {"severity": "critical", "category": "lottery_scam"},
        "lucky draw": {"severity": "critical", "category": "lottery_scam"},
        "won": {"severity": "high", "category": "lottery_scam"},
        "congratulations": {"severity": "high", "category": "lottery_scam"},
        "claim": {"severity": "medium", "category": "lottery_scam"},
        
        # Investment scams
        "investment": {"severity": "high", "category": "investment_scam"},
        "double money": {"severity": "critical", "category": "investment_scam"},
        "guaranteed return": {"severity": "critical", "category": "investment_scam"},
        "high return": {"severity": "high", "category": "investment_scam"},
        "crypto": {"severity": "medium", "category": "investment_scam"},
        "trading": {"severity": "medium", "category": "investment_scam"},
        "forex": {"severity": "high", "category": "investment_scam"},
        
        # Job scams
        "job offer": {"severity": "high", "category": "job_scam"},
        "work from home": {"severity": "medium", "category": "job_scam"},
        "registration fee": {"severity": "critical", "category": "job_scam"},
        "processing fee": {"severity": "critical", "category": "job_scam"},
        "joining fee": {"severity": "critical", "category": "job_scam"},
        
        # KYC/Bank scams  
        "kyc": {"severity": "high", "category": "kyc_scam"},
        "account block": {"severity": "critical", "category": "kyc_scam"},
        "verify account": {"severity": "high", "category": "kyc_scam"},
        "bank verification": {"severity": "high", "category": "kyc_scam"},
        "aadhar update": {"severity": "high", "category": "kyc_scam"},
        "pan update": {"severity": "high", "category": "kyc_scam"},
        
        # Urgency indicators
        "urgent": {"severity": "medium", "category": "urgency"},
        "immediately": {"severity": "medium", "category": "urgency"},
        "last chance": {"severity": "high", "category": "urgency"},
        "limited time": {"severity": "medium", "category": "urgency"},
        "today only": {"severity": "medium", "category": "urgency"},
        
        # Refund scams
        "refund": {"severity": "medium", "category": "refund_scam"},
        "cashback": {"severity": "medium", "category": "refund_scam"},
        
        # OTP/Password scams
        "otp": {"severity": "critical", "category": "otp_scam"},
        "password": {"severity": "critical", "category": "otp_scam"},
        "pin": {"severity": "critical", "category": "otp_scam"},
    }
    
    SCAM_CATEGORY_MESSAGES = {
        "lottery_scam": "This looks like a LOTTERY/PRIZE SCAM. No legitimate lottery asks for advance payment!",
        "investment_scam": "This appears to be an INVESTMENT SCAM. No investment guarantees returns!",
        "job_scam": "This looks like a JOB SCAM. Real jobs never ask for fees!",
        "kyc_scam": "This appears to be a KYC SCAM. Banks never ask for money for KYC!",
        "urgency": "Urgency tactics are common in scams. Take your time!",
        "refund_scam": "Refund scams often trick victims into sending money instead!",
        "otp_scam": "NEVER share OTP/PIN for receiving money. This is a SCAM!"
    }
    
    def __init__(self):
        # User transaction history (in production, use Redis/DB)
        self.user_history: Dict[str, List[Dict]] = {}
        # Known scammer list — pre-loaded from Excel database
        self.scammer_list: set = set()
        # AI intervention queue
        self.intervention_queue: Dict[str, Dict] = {}
        
        # Delegate behavioural profiles to the LSTM profiler singleton so
        # there is a single source of truth (and profiles survive restarts).
        from app.ml.pipeline import get_model_inference
        self._lstm_profiler = get_model_inference().lstm
        
        # Load scammer list from Excel on startup
        self._load_scammer_list()
    
    @property
    def user_profiles(self) -> Dict[str, Dict]:
        """Proxy to the LSTM profiler's user_profiles (single source of truth)."""
        return self._lstm_profiler.user_profiles
    
    def _load_scammer_list(self):
        """Pre-load known scammers from Excel database on service startup"""
        try:
            from app.db.excel_database import ExcelDatabase
            scammers = ExcelDatabase.get_all_scammers()
            for s in scammers:
                upi = s.get("upi_id", "").strip().lower()
                if upi:
                    self.scammer_list.add(upi)
            if self.scammer_list:
                import logging
                logging.getLogger(__name__).info(
                    f"✅ Loaded {len(self.scammer_list)} known scammers from database"
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not load scammer list: {e}")
    
    def analyze_transaction(
        self,
        user_id: str,
        recipient_upi: str,
        amount: float,
        recipient_info: Optional[Dict] = None,
        device_info: Optional[Dict] = None,
        timestamp: Optional[datetime] = None,
        note: Optional[str] = None,
        sensor_data: Optional[Dict] = None
    ) -> TransactionAnalysis:
        """
        Analyze a transaction for fraud in real-time
        
        Args:
            user_id: User making the transaction
            recipient_upi: Recipient's UPI ID
            amount: Transaction amount in INR
            recipient_info: Optional recipient verification info
            device_info: Optional device/location info
            timestamp: Transaction time (defaults to now)
            note: Transaction note/description for NLP analysis
        
        Returns:
            TransactionAnalysis with risk score, alerts, and recommended action
        """
        timestamp = timestamp or datetime.now(timezone.utc)
        alerts: List[FraudAlert] = []
        explanations: List[str] = []
        model_scores: Dict[str, float] = {}
        requires_ai_intervention = False
        
        # 1. Check for known scammer
        scammer_alert = self._check_scammer_list(recipient_upi)
        if scammer_alert:
            alerts.append(scammer_alert)
            explanations.append(f"Recipient {recipient_upi} has been reported for fraud")
        
        # 2. Amount-based analysis
        amount_alerts = self._analyze_amount(amount, user_id)
        alerts.extend(amount_alerts)
        if any(a.alert_type == AlertType.HIGH_AMOUNT for a in amount_alerts):
            avg = self._get_user_avg_amount(user_id)
            explanations.append(f"Amount ₹{amount:,.0f} is {'significantly ' if amount > self.VERY_HIGH_AMOUNT_THRESHOLD else ''}higher than your average of ₹{avg:,.0f}")
        
        # 3. Recipient analysis
        recipient_alerts = self._analyze_recipient(user_id, recipient_upi, recipient_info)
        alerts.extend(recipient_alerts)
        if any(a.alert_type == AlertType.FIRST_TIME_RECIPIENT for a in recipient_alerts):
            explanations.append("This is your first payment to this recipient")
        if any(a.alert_type == AlertType.UNKNOWN_RECIPIENT for a in recipient_alerts):
            explanations.append("Recipient is not verified and has low trust score")
        
        # 4. Time-based analysis
        time_alerts = self._analyze_timing(timestamp, user_id)
        alerts.extend(time_alerts)
        if any(a.alert_type == AlertType.UNUSUAL_TIME for a in time_alerts):
            explanations.append(f"Transaction at unusual time ({timestamp.strftime('%H:%M')})")
        
        # 5. Rapid transaction detection
        rapid_alerts = self._check_rapid_transactions(user_id, timestamp)
        alerts.extend(rapid_alerts)
        if any(a.alert_type == AlertType.RAPID_TRANSACTIONS for a in rapid_alerts):
            explanations.append("Multiple transactions in short time detected")
        
        # 6. NLP-based scam keyword detection in note
        if note:
            scam_alerts, scam_explanations = self._analyze_note_for_scam(note)
            alerts.extend(scam_alerts)
            explanations.extend(scam_explanations)
            if any(a.severity == "critical" for a in scam_alerts):
                requires_ai_intervention = True
        
        # 7. Behavioral analysis
        behavior_score = self._analyze_behavior(user_id, amount, recipient_upi, timestamp)
        model_scores["behavioral"] = behavior_score
        
        # 7b. Sensor stress analysis (gyroscope, accelerometer, touch, typing)
        sensor_stress_score = 0.0
        if sensor_data:
            sensor_stress_score = self._analyze_sensor_stress(sensor_data)
            model_scores["sensor_stress"] = sensor_stress_score
            if sensor_stress_score > 60:
                alerts.append(FraudAlert(
                    alert_type=AlertType.BEHAVIORAL_ANOMALY,
                    severity="medium" if sensor_stress_score < 80 else "high",
                    message="Unusual device usage pattern detected — possible duress or coercion",
                    details={"sensor_stress_score": sensor_stress_score}
                ))
                explanations.append(f"Sensor analysis detected stress indicators (score: {sensor_stress_score:.0f}/100)")
        
        # 8. Calculate final risk score
        risk_score = self._calculate_risk_score(alerts, behavior_score, amount)
        model_scores["risk_score"] = risk_score
        model_scores["nlp_scam_score"] = sum(50 if a.alert_type == AlertType.SCAM_KEYWORDS else 0 for a in alerts)
        
        # 9. Determine risk level and action
        risk_level, action = self._determine_action(risk_score, alerts)
        
        # 10. Check if AI intervention is required
        if requires_ai_intervention or risk_score >= 60:
            action = "ai_intervention"
            alerts.append(FraudAlert(
                alert_type=AlertType.AI_INTERVENTION_REQUIRED,
                severity="high",
                message="AI verification required before proceeding",
                details={"reason": "High risk transaction detected"}
            ))
            explanations.append("Our AI will ask you a few questions to verify this transaction")
        
        # 11. Record transaction for future analysis
        self._record_transaction(user_id, recipient_upi, amount, timestamp, risk_score)
        
        return TransactionAnalysis(
            risk_score=risk_score,
            risk_level=risk_level,
            alerts=alerts,
            action=action,
            explanations=explanations,
            model_scores=model_scores
        )
    
    def _check_scammer_list(self, upi_id: str) -> Optional[FraudAlert]:
        """Check if UPI ID is in known scammer list"""
        if upi_id.lower() in self.scammer_list:
            return FraudAlert(
                alert_type=AlertType.KNOWN_SCAMMER,
                severity="critical",
                message="Recipient is a known scammer",
                details={"upi_id": upi_id}
            )
        return None
    
    def _analyze_amount(self, amount: float, user_id: str) -> List[FraudAlert]:
        """Analyze transaction amount for anomalies"""
        alerts = []
        user_avg = self._get_user_avg_amount(user_id)
        
        if amount >= self.VERY_HIGH_AMOUNT_THRESHOLD:
            alerts.append(FraudAlert(
                alert_type=AlertType.HIGH_AMOUNT,
                severity="high",
                message=f"Very high amount: ₹{amount:,.0f}",
                details={"amount": amount, "threshold": self.VERY_HIGH_AMOUNT_THRESHOLD}
            ))
        elif amount >= self.HIGH_AMOUNT_THRESHOLD and amount > user_avg * 3:
            alerts.append(FraudAlert(
                alert_type=AlertType.HIGH_AMOUNT,
                severity="medium",
                message=f"Amount significantly higher than usual",
                details={"amount": amount, "user_avg": user_avg}
            ))
        
        return alerts
    
    def _analyze_note_for_scam(self, note: str) -> Tuple[List[FraudAlert], List[str]]:
        """
        NLP-based scam detection in transaction notes
        
        Analyzes the transaction note/description for known scam patterns
        and returns alerts with explanations
        """
        alerts = []
        explanations = []
        note_lower = note.lower()
        found_categories = set()
        highest_severity = None
        severity_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        
        for keyword, info in self.SCAM_KEYWORDS.items():
            if keyword in note_lower:
                category = info["category"]
                severity = info["severity"]
                
                # Track highest severity found
                if highest_severity is None or severity_order[severity] > severity_order[highest_severity]:
                    highest_severity = severity
                
                # Add category if not already added
                if category not in found_categories:
                    found_categories.add(category)
                    
                    # Add explanation for this category
                    if category in self.SCAM_CATEGORY_MESSAGES:
                        explanations.append(self.SCAM_CATEGORY_MESSAGES[category])
        
        # If any scam keywords found, create alert
        if found_categories:
            primary_category = list(found_categories)[0]
            alerts.append(FraudAlert(
                alert_type=AlertType.SCAM_KEYWORDS,
                severity=highest_severity or "high",
                message=f"⚠️ POTENTIAL SCAM DETECTED: {', '.join(found_categories).replace('_', ' ').title()}",
                details={
                    "categories": list(found_categories),
                    "matched_note": note,
                    "severity": highest_severity
                }
            ))
            
            # Add warning explanation
            explanations.insert(0, f"🚨 WARNING: The note '{note}' contains scam indicators!")
        
        return alerts, explanations
    
    def _analyze_recipient(
        self, 
        user_id: str, 
        recipient_upi: str,
        recipient_info: Optional[Dict]
    ) -> List[FraudAlert]:
        """Analyze recipient for risk signals"""
        alerts = []
        
        # Check if first-time recipient
        user_recipients = self._get_user_recipients(user_id)
        if recipient_upi not in user_recipients:
            alerts.append(FraudAlert(
                alert_type=AlertType.FIRST_TIME_RECIPIENT,
                severity="low",
                message="First payment to this recipient",
                details={"recipient": recipient_upi}
            ))
        
        # Check recipient verification status
        if recipient_info:
            if not recipient_info.get("is_verified", False):
                trust_score = recipient_info.get("trust_score", 50)
                if trust_score < 30:
                    alerts.append(FraudAlert(
                        alert_type=AlertType.UNKNOWN_RECIPIENT,
                        severity="high",
                        message="Unverified recipient with low trust score",
                        details={"trust_score": trust_score}
                    ))
                elif trust_score < 50:
                    alerts.append(FraudAlert(
                        alert_type=AlertType.UNKNOWN_RECIPIENT,
                        severity="medium",
                        message="Recipient has moderate trust score",
                        details={"trust_score": trust_score}
                    ))
        
        return alerts
    
    def _analyze_timing(self, timestamp: datetime, user_id: str) -> List[FraudAlert]:
        """Analyze transaction timing"""
        alerts = []
        hour = timestamp.hour
        
        # Check for unusual hours
        if hour >= self.UNUSUAL_HOUR_START or hour < self.UNUSUAL_HOUR_END:
            alerts.append(FraudAlert(
                alert_type=AlertType.UNUSUAL_TIME,
                severity="low",
                message=f"Transaction at unusual time ({hour}:00)",
                details={"hour": hour}
            ))
        
        return alerts
    
    def _check_rapid_transactions(self, user_id: str, timestamp: datetime) -> List[FraudAlert]:
        """Check for rapid successive transactions"""
        alerts = []
        history = self.user_history.get(user_id, [])
        
        # Count transactions in last N minutes
        window_start = timestamp - timedelta(minutes=self.RAPID_TXN_WINDOW_MINUTES)
        recent_count = sum(
            1 for txn in history 
            if txn.get("timestamp", datetime.min) > window_start
        )
        
        if recent_count >= self.RAPID_TXN_COUNT_THRESHOLD:
            alerts.append(FraudAlert(
                alert_type=AlertType.RAPID_TRANSACTIONS,
                severity="medium",
                message=f"{recent_count + 1} transactions in {self.RAPID_TXN_WINDOW_MINUTES} minutes",
                details={"count": recent_count + 1, "window_minutes": self.RAPID_TXN_WINDOW_MINUTES}
            ))
        
        return alerts
    
    def _analyze_behavior(
        self, 
        user_id: str, 
        amount: float, 
        recipient: str, 
        timestamp: datetime
    ) -> float:
        """
        Behavioral analysis score (0-100)
        Lower score = more normal behavior
        Delegates to the shared LSTM profiler profiles.
        """
        profile = self._lstm_profiler._get_or_create_profile(user_id)
        score = 0.0
        
        # Amount deviation from average
        avg_amount = profile.get("avg_amount", 2000)
        if avg_amount > 0:
            amount_deviation = abs(amount - avg_amount) / avg_amount
            score += min(amount_deviation * 20, 40)  # Max 40 points
        
        # Time deviation from usual pattern
        usual_hours = profile.get("typical_hours", list(range(9, 22)))
        if timestamp.hour not in usual_hours:
            score += 15
        
        # Recipient trust
        frequent_recipients = profile.get("frequent_recipients", {})
        if recipient not in frequent_recipients:
            score += 10
        
        return min(score, 100)
    
    def _analyze_sensor_stress(self, sensor_data: Dict) -> float:
        """
        Analyze device sensor data for stress/coercion indicators.
        
        High gyroscope = shaking hands (nervousness)
        Low typing speed = hesitation/dictation by scammer  
        High touch pressure = stress
        High accelerometer = pacing/agitation
        
        Returns stress score 0-100
        """
        import math
        score = 0.0
        
        # Gyroscope analysis — hand tremor detection
        gyro = sensor_data.get("gyroscope", {})
        gyro_magnitude = math.sqrt(
            gyro.get("x", 0) ** 2 + gyro.get("y", 0) ** 2 + gyro.get("z", 0) ** 2
        )
        # Normal phone use: ~0.1-0.5 rad/s, stressed/shaking: >1.0
        if gyro_magnitude > 2.0:
            score += 30
        elif gyro_magnitude > 1.0:
            score += 15
        elif gyro_magnitude > 0.5:
            score += 5
        
        # Accelerometer analysis — pacing/agitation
        accel = sensor_data.get("accelerometer", {})
        accel_magnitude = math.sqrt(
            accel.get("x", 0) ** 2 + accel.get("y", 0) ** 2 + accel.get("z", 0) ** 2
        )
        # Gravity ~9.8, so deviation from 9.8 indicates movement
        accel_deviation = abs(accel_magnitude - 9.8)
        if accel_deviation > 3.0:
            score += 20
        elif accel_deviation > 1.5:
            score += 10
        
        # Touch pressure — heavy press = stress
        touch_pressure = sensor_data.get("touch_pressure", 0)
        if touch_pressure > 0.8:
            score += 25
        elif touch_pressure > 0.5:
            score += 10
        
        # Typing speed — very slow = being dictated to by scammer
        typing_speed = sensor_data.get("typing_speed", 0)
        if 0 < typing_speed < 30:  # Very slow typing (< 30 ms between keys = suspicious)
            score += 25
        elif typing_speed > 500:  # Very slow inter-key delay — hesitant/dictated
            score += 15
        
        return min(score, 100)
    
    def _calculate_risk_score(
        self, 
        alerts: List[FraudAlert], 
        behavior_score: float,
        amount: float
    ) -> float:
        """Calculate final risk score (0-100)"""
        base_score = behavior_score * 0.3  # 30% from behavior
        
        # Add alert-based scores
        severity_scores = {"low": 5, "medium": 15, "high": 25, "critical": 40}
        alert_score = sum(severity_scores.get(a.severity, 0) for a in alerts)
        
        # Cap alert score at 70
        alert_score = min(alert_score, 70)
        
        # Amount factor (higher amounts = higher risk)
        amount_factor = min(amount / 100000, 0.3) * 30  # Max 30 points from amount
        
        final_score = base_score + alert_score + amount_factor
        return min(final_score, 100)
    
    def _determine_action(
        self, 
        risk_score: float, 
        alerts: List[FraudAlert]
    ) -> Tuple[RiskLevel, str]:
        """Determine risk level and recommended action"""
        
        # Critical alerts override score
        has_critical = any(a.severity == "critical" for a in alerts)
        if has_critical:
            return RiskLevel.DANGEROUS, "block"
        
        if risk_score >= 75:
            return RiskLevel.DANGEROUS, "block"
        elif risk_score >= 50:
            return RiskLevel.RISKY, "require_verification"
        elif risk_score >= 30:
            return RiskLevel.CAUTION, "delay"
        else:
            return RiskLevel.SAFE, "allow"
    
    def _get_user_avg_amount(self, user_id: str) -> float:
        """Get user's average transaction amount"""
        profile = self._lstm_profiler._get_or_create_profile(user_id)
        return profile.get("avg_amount", 2000.0)
    
    def _get_user_recipients(self, user_id: str) -> set:
        """Get set of user's past recipients"""
        profile = self._lstm_profiler._get_or_create_profile(user_id)
        return set(profile.get("frequent_recipients", {}).keys())
    
    def _record_transaction(
        self, 
        user_id: str, 
        recipient: str, 
        amount: float, 
        timestamp: datetime,
        risk_score: float
    ):
        """Record transaction for future analysis"""
        if user_id not in self.user_history:
            self.user_history[user_id] = []
        
        self.user_history[user_id].append({
            "recipient": recipient,
            "amount": amount,
            "timestamp": timestamp,
            "risk_score": risk_score
        })
        
        # Keep only last 100 transactions
        self.user_history[user_id] = self.user_history[user_id][-100:]
        
        # Update user profile
        self._update_user_profile(user_id, recipient, amount, timestamp)
    
    def _update_user_profile(
        self, 
        user_id: str, 
        recipient: str, 
        amount: float, 
        timestamp: datetime
    ):
        """Delegate profile update to the LSTM profiler (single source of truth)."""
        self._lstm_profiler.update_profile(user_id, {
            "amount": amount,
            "hour_of_day": timestamp.hour,
            "day_of_week": timestamp.weekday(),
            "recipient_upi": recipient,
            "is_new_recipient": recipient not in self._lstm_profiler._get_or_create_profile(user_id).get("frequent_recipients", {}),
        })
    
    def add_scammer(self, upi_id: str):
        """Add UPI ID to scammer list"""
        self.scammer_list.add(upi_id.lower())
    
    def remove_scammer(self, upi_id: str):
        """Remove UPI ID from scammer list"""
        self.scammer_list.discard(upi_id.lower())
    
    def load_scammer_list(self, upi_ids: List[str]):
        """Load list of known scammer UPI IDs"""
        self.scammer_list = set(upi.lower() for upi in upi_ids)


# Singleton instance
_fraud_service: Optional[FraudDetectionService] = None


def get_fraud_detection_service() -> FraudDetectionService:
    """Get or create fraud detection service instance"""
    global _fraud_service
    if _fraud_service is None:
        _fraud_service = FraudDetectionService()
    return _fraud_service
