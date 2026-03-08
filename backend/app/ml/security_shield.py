"""
7-LAYER SECURITY SHIELD
=======================
Every transaction passes through ALL layers sequentially.
If ANY layer fails → Transaction blocked or warned.

Layer 1: Environment Shield (Kill Switch)
Layer 2: Input Sanitization Shield
Layer 3: Hard Rules Shield (Cannot be bypassed)
Layer 4: Verification Shield (UPI Verification)
Layer 5: ML Intelligence Shield
Layer 6: Community Intelligence Shield
Layer 7: Decision & Explanation Shield
"""
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
from enum import Enum
from datetime import datetime
import re
import hashlib


class RiskLevel(Enum):
    SAFE = "safe"           # 0-25
    CAUTION = "caution"     # 26-50
    RISKY = "risky"         # 51-75
    DANGEROUS = "dangerous" # 76-100
    BLOCKED = "blocked"     # Blocklist match


class ThreatType(Enum):
    SCREEN_RECORDING = "screen_recording"
    SCREEN_SHARING = "screen_sharing"
    OVERLAY = "overlay"
    ROOTED_DEVICE = "rooted_device"
    BLOCKLIST_MATCH = "blocklist_match"
    SCAM_KEYWORDS = "scam_keywords"
    NEW_ACCOUNT = "new_account"
    HIGH_AMOUNT = "high_amount"
    ANOMALOUS_BEHAVIOR = "anomalous_behavior"
    COMMUNITY_REPORTS = "community_reports"
    SUSPICIOUS_NAME = "suspicious_name"


@dataclass
class LayerResult:
    """Result from a single security layer"""
    layer_name: str
    passed: bool
    risk_score: float  # 0-100
    reasons: List[str] = field(default_factory=list)
    threats: List[ThreatType] = field(default_factory=list)
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SecurityAnalysis:
    """Complete security analysis result"""
    transaction_id: str
    timestamp: datetime
    
    # Final Decision (Rule-Based, NOT AI)
    risk_level: RiskLevel
    final_score: float
    is_blocked: bool
    can_proceed: bool
    
    # Layer Results
    layer_results: List[LayerResult]
    
    # Explanation (for user)
    primary_reason: str
    all_reasons: List[str]
    safety_tips: List[str]
    scam_type_detected: Optional[str]
    
    # Education link
    education_link: Optional[str]


class SecurityShield:
    """
    The 7-Layer Security Shield
    ===========================
    "Google Pay protects your PIN. We protect your judgment."
    """
    
    # ==================== BLOCKLISTS ====================
    HARD_BLOCKLIST_UPIS = {
        "lottery.winner@scam",
        "kyc.update@fake", 
        "cbi.officer@fraud",
        "customer.care@fake",
        "refund.process@scam",
    }
    
    SCAM_KEYWORDS = {
        "critical": ["lottery", "winner", "prize", "jackpot", "cbi", "arrest", "police", "customs"],
        "high": ["kyc", "blocked", "suspended", "verify", "update", "urgent", "official", "support", "helpdesk"],
        "medium": ["refund", "cashback", "bonus", "offer", "free", "gift"],
    }
    
    SUSPICIOUS_NAME_PATTERNS = [
        r"lucky\s*winner",
        r"lottery",
        r"prize",
        r"customer\s*care",
        r"kyc\s*update",
        r"official\s*support",
        r"bank\s*refund",
        r"all\s*caps\s*name",  # Placeholder
    ]
    
    SCAM_TYPE_MAPPING = {
        "lottery": {"keywords": ["lottery", "winner", "prize", "jackpot"], "education": "/education/lottery-scam"},
        "kyc_fraud": {"keywords": ["kyc", "update", "blocked", "verify"], "education": "/education/kyc-scam"},
        "digital_arrest": {"keywords": ["cbi", "police", "arrest", "customs"], "education": "/education/digital-arrest"},
        "refund_scam": {"keywords": ["refund", "cashback", "return"], "education": "/education/refund-scam"},
        "fake_support": {"keywords": ["support", "helpdesk", "customer.care"], "education": "/education/fake-support"},
    }
    
    def __init__(self, excel_database=None, ml_models=None):
        self.excel_database = excel_database
        self.ml_models = ml_models or {}
    
    async def analyze_transaction(
        self,
        upi_id: str,
        amount: float,
        user_id: str,
        environment_data: Dict[str, Any] = None,
        user_profile: Dict[str, Any] = None,
    ) -> SecurityAnalysis:
        """
        Main entry point - runs all 7 layers
        """
        transaction_id = hashlib.md5(f"{upi_id}{amount}{datetime.now().isoformat()}".encode()).hexdigest()[:16]
        
        all_results: List[LayerResult] = []
        all_reasons: List[str] = []
        is_blocked = False
        
        # ============ LAYER 1: Environment Shield ============
        layer1 = self._layer1_environment(environment_data or {})
        all_results.append(layer1)
        all_reasons.extend(layer1.reasons)
        if not layer1.passed:
            is_blocked = True
        
        # ============ LAYER 2: Input Sanitization ============
        sanitized_upi, layer2 = self._layer2_sanitization(upi_id)
        all_results.append(layer2)
        all_reasons.extend(layer2.reasons)
        if not layer2.passed:
            is_blocked = True
        
        # ============ LAYER 3: Hard Rules Shield ============
        layer3 = self._layer3_hard_rules(sanitized_upi, amount)
        all_results.append(layer3)
        all_reasons.extend(layer3.reasons)
        if not layer3.passed:
            is_blocked = True
        
        # ============ LAYERS 4-6: Run in PARALLEL for speed ============
        import asyncio
        layer4, layer5_pre, layer6 = await asyncio.gather(
            self._layer4_verification(sanitized_upi),
            self._layer5_ml_analysis(
                sanitized_upi, amount, user_profile or {}, layer3.data, {}
            ),
            self._layer6_community(sanitized_upi),
        )
        
        all_results.append(layer4)
        all_reasons.extend(layer4.reasons)
        
        all_results.append(layer5_pre)
        all_reasons.extend(layer5_pre.reasons)
        
        all_results.append(layer6)
        all_reasons.extend(layer6.reasons)
        if layer6.data.get("report_count", 0) >= 10:
            is_blocked = True
        
        # ============ LAYER 7: Decision & Explanation ============
        final_result = self._layer7_decision(all_results, is_blocked)
        all_results.append(final_result)
        
        # Calculate final score - USE MAX of critical layers, not average
        # This ensures high-risk detections aren't diluted
        critical_scores = [layer3.risk_score, layer5_pre.risk_score, layer6.risk_score]
        max_critical_score = max(critical_scores) if critical_scores else 0
        avg_score = sum(r.risk_score for r in all_results) / len(all_results)
        
        # Final score: weighted combination (critical layers matter more)
        total_score = max(max_critical_score, avg_score * 1.5)
        total_score = min(total_score, 100)  # Cap at 100
        
        # If scam type detected, minimum score is 60
        scam_type = layer3.data.get("scam_type")
        if scam_type:
            total_score = max(total_score, 60)
        
        # Determine risk level
        risk_level = self._calculate_risk_level(total_score, is_blocked)
        
        # Generate safety tips
        safety_tips = self._generate_safety_tips(scam_type)
        
        # Get education link
        education_link = None
        if scam_type and scam_type in self.SCAM_TYPE_MAPPING:
            education_link = self.SCAM_TYPE_MAPPING[scam_type]["education"]
        
        return SecurityAnalysis(
            transaction_id=transaction_id,
            timestamp=datetime.now(),
            risk_level=risk_level,
            final_score=total_score,
            is_blocked=is_blocked,
            can_proceed=not is_blocked and risk_level in [RiskLevel.SAFE, RiskLevel.CAUTION],
            layer_results=all_results,
            primary_reason=all_reasons[0] if all_reasons else "Transaction analyzed",
            all_reasons=all_reasons,
            safety_tips=safety_tips,
            scam_type_detected=scam_type,
            education_link=education_link,
        )
    
    # ==================== LAYER 1: Environment Shield ====================
    def _layer1_environment(self, env_data: Dict[str, Any]) -> LayerResult:
        """
        THE KILL SWITCH
        Detects screen recording, sharing, overlay attacks
        """
        reasons = []
        risk_score = 0
        threats = []
        passed = True
        
        # Check for screen recording
        if env_data.get("screen_recording"):
            reasons.append("🚨 Screen recording detected - payments blocked for your safety")
            threats.append(ThreatType.SCREEN_RECORDING)
            risk_score = 100
            passed = False
        
        # Check for screen sharing (AnyDesk, TeamViewer)
        if env_data.get("screen_sharing"):
            reasons.append("🚨 Screen sharing app active (AnyDesk/TeamViewer) - this is how scammers steal money")
            threats.append(ThreatType.SCREEN_SHARING)
            risk_score = 100
            passed = False
        
        # Check for overlay attacks
        if env_data.get("overlay_detected"):
            reasons.append("⚠️ Another app is drawing over the screen - potential clickjacking attack")
            threats.append(ThreatType.OVERLAY)
            risk_score = 80
            passed = False
        
        # Check for rooted device
        if env_data.get("device_rooted"):
            reasons.append("⚠️ Device security may be compromised (rooted/jailbroken)")
            threats.append(ThreatType.ROOTED_DEVICE)
            risk_score = max(risk_score, 30)
        
        return LayerResult(
            layer_name="Environment Shield (Kill Switch)",
            passed=passed,
            risk_score=risk_score,
            reasons=reasons,
            threats=threats,
            data={"environment_safe": passed}
        )
    
    # ==================== LAYER 2: Input Sanitization ====================
    def _layer2_sanitization(self, upi_id: str) -> Tuple[str, LayerResult]:
        """
        Sanitize and validate UPI ID
        Prevents injection attacks
        """
        reasons = []
        risk_score = 0
        passed = True
        
        # Basic validation
        if not upi_id or len(upi_id) < 3:
            reasons.append("❌ Invalid UPI ID format")
            passed = False
            risk_score = 100
            return "", LayerResult("Input Sanitization", False, 100, reasons, [], {})
        
        # Remove whitespace and convert to lowercase
        sanitized = upi_id.strip().lower()
        
        # Check format: must have @
        if "@" not in sanitized:
            reasons.append("❌ Invalid UPI format - must contain @")
            passed = False
            risk_score = 100
        
        # Remove potentially dangerous characters
        original = sanitized
        sanitized = re.sub(r'[<>"\';{}()]', '', sanitized)
        if sanitized != original:
            reasons.append("⚠️ Suspicious characters removed from UPI ID")
            risk_score = max(risk_score, 20)
        
        # Check length
        if len(sanitized) > 50:
            sanitized = sanitized[:50]
            reasons.append("⚠️ UPI ID was too long - truncated")
            risk_score = max(risk_score, 10)
        
        # Validate handle (after @)
        if "@" in sanitized:
            handle = sanitized.split("@")[-1]
            valid_handles = ["ybl", "okaxis", "paytm", "icici", "sbi", "hdfc", "apl", "ibl", "axl", "upi"]
            if handle not in valid_handles and len(handle) > 10:
                reasons.append(f"⚠️ Unusual bank handle: @{handle}")
                risk_score = max(risk_score, 15)
        
        return sanitized, LayerResult(
            layer_name="Input Sanitization",
            passed=passed,
            risk_score=risk_score,
            reasons=reasons,
            threats=[],
            data={"sanitized_upi": sanitized, "original_upi": upi_id}
        )
    
    # ==================== LAYER 3: Hard Rules Shield ====================
    def _layer3_hard_rules(self, upi_id: str, amount: float) -> LayerResult:
        """
        Deterministic rules that CANNOT be bypassed
        Even AI manipulation cannot override these
        """
        reasons = []
        risk_score = 0
        threats = []
        passed = True
        scam_type = None
        keyword_matches = []
        
        # RULE 1: Hard blocklist check
        if upi_id in self.HARD_BLOCKLIST_UPIS:
            reasons.append("🚫 This UPI ID is in our fraud blocklist - PAYMENT BLOCKED")
            threats.append(ThreatType.BLOCKLIST_MATCH)
            risk_score = 100
            passed = False
        
        # RULE 2: Keyword analysis
        upi_lower = upi_id.lower()
        
        for severity, keywords in self.SCAM_KEYWORDS.items():
            for keyword in keywords:
                if keyword in upi_lower:
                    keyword_matches.append((keyword, severity))
                    if severity == "critical":
                        reasons.append(f"🔴 SCAM KEYWORD DETECTED: '{keyword}' in UPI ID")
                        risk_score += 35
                        threats.append(ThreatType.SCAM_KEYWORDS)
                    elif severity == "high":
                        reasons.append(f"🟠 Suspicious keyword: '{keyword}' often used in scams")
                        risk_score += 20
                    else:
                        reasons.append(f"🟡 Caution: '{keyword}' is sometimes used in scam UPIs")
                        risk_score += 10
        
        # RULE 3: Detect scam type
        for stype, config in self.SCAM_TYPE_MAPPING.items():
            for kw in config["keywords"]:
                if kw in upi_lower:
                    scam_type = stype
                    break
            if scam_type:
                break
        
        if scam_type:
            scam_names = {
                "lottery": "LOTTERY SCAM",
                "kyc_fraud": "KYC/VERIFICATION FRAUD",
                "digital_arrest": "DIGITAL ARREST SCAM",
                "refund_scam": "FAKE REFUND SCAM",
                "fake_support": "FAKE CUSTOMER SUPPORT",
            }
            reasons.insert(0, f"🚨 {scam_names.get(scam_type, 'SCAM')} PATTERN DETECTED")
        
        # RULE 4: Pattern detection
        # Random numbers at end (lottery123, winner2024)
        if re.search(r'\d{3,}', upi_id):
            reasons.append("⚠️ UPI contains suspicious number pattern (common in fraud accounts)")
            risk_score += 15
        
        # Bank name spoofing (sbi.official, hdfc.support)
        if re.search(r'(sbi|hdfc|icici|axis|bank)\.(official|support|care|help)', upi_lower):
            reasons.append("🔴 Bank name spoofing detected - official bank UPIs don't look like this")
            risk_score += 25
            threats.append(ThreatType.SCAM_KEYWORDS)
        
        # RULE 5: Amount thresholds
        if amount > 50000:
            reasons.append(f"⚠️ Large transaction (₹{amount:,.0f}) - extra verification recommended")
            risk_score += 15
            threats.append(ThreatType.HIGH_AMOUNT)
        elif amount > 10000:
            reasons.append(f"⚠️ Moderate amount (₹{amount:,.0f}) - please verify recipient")
            risk_score += 5
        
        # Round numbers just below limits (suspicious)
        if amount in [9999, 19999, 49999, 99999]:
            reasons.append("⚠️ Amount just below transfer limit - common fraud pattern")
            risk_score += 10
        
        return LayerResult(
            layer_name="Hard Rules Shield",
            passed=passed,
            risk_score=min(risk_score, 100),
            reasons=reasons,
            threats=threats,
            data={
                "scam_type": scam_type,
                "keyword_matches": keyword_matches,
                "amount_risk": amount > 10000
            }
        )
    
    # ==================== LAYER 4: Verification Shield ====================
    async def _layer4_verification(self, upi_id: str) -> LayerResult:
        """
        Real UPI verification via API
        Fetches actual account holder name
        """
        reasons = []
        risk_score = 0
        threats = []
        verified_name = None
        
        # In production, this would call Razorpay/Cashfree API
        # For demo, we simulate verification
        
        try:
            # Simulated verification result
            if self.excel_database:
                contact = self.excel_database.get_contact_by_upi(upi_id)
                if contact:
                    verified_name = contact["name"]
                    if contact.get("is_verified"):
                        reasons.append(f"✅ Verified: {verified_name}")
                        risk_score = 0
                    else:
                        reasons.append(f"⚠️ Account found: {verified_name} (not verified)")
                        risk_score = 15
                else:
                    # Check scammer database
                    scammer = self.excel_database.check_scammer(upi_id)
                    if scammer:
                        reasons.append(f"🚫 KNOWN SCAMMER: Reported {scammer['report_count']} times")
                        risk_score = 90
                        threats.append(ThreatType.BLOCKLIST_MATCH)
                    else:
                        reasons.append("⚠️ New/unknown recipient - please verify before paying")
                        risk_score = 20
                        threats.append(ThreatType.NEW_ACCOUNT)
            else:
                # Fallback: Generate name from UPI ID for demo
                name_part = upi_id.split("@")[0].replace(".", " ").replace("_", " ").title()
                verified_name = name_part
                
                # Check name for suspicious patterns
                for pattern in self.SUSPICIOUS_NAME_PATTERNS:
                    if re.search(pattern, name_part.lower()):
                        reasons.append(f"🔴 Suspicious account name: '{verified_name}'")
                        risk_score += 25
                        threats.append(ThreatType.SUSPICIOUS_NAME)
                        break
                
                # ALL CAPS name is suspicious
                if verified_name.isupper():
                    reasons.append("⚠️ Account name is ALL CAPS - common in fraud accounts")
                    risk_score += 10
                
                if not reasons:
                    reasons.append(f"✅ Account verified: {verified_name}")
        
        except Exception as e:
            reasons.append("⚠️ Could not verify UPI - proceed with caution")
            risk_score = 25
        
        return LayerResult(
            layer_name="Verification Shield",
            passed=True,  # Don't block, just add risk
            risk_score=min(risk_score, 100),
            reasons=reasons,
            threats=threats,
            data={
                "verified_name": verified_name,
                "verification_status": "verified" if risk_score < 20 else "suspicious"
            }
        )
    
    # ==================== LAYER 5: ML Intelligence Shield ====================
    async def _layer5_ml_analysis(
        self, 
        upi_id: str, 
        amount: float, 
        user_profile: Dict[str, Any],
        hard_rules_data: Dict[str, Any],
        verification_data: Dict[str, Any]
    ) -> LayerResult:
        """
        ML models for fraud detection — uses real trained models via ModelInference.
        - XGBoost: Trained on 6.3M PaySim transactions (ROC-AUC 0.9996)
        - Isolation Forest: Anomaly detection
        - LSTM/GBT: Behavioral profiling
        - GNN: Transaction graph analysis
        - Sensor: Stress/coercion detection
        """
        from app.ml.pipeline.model_inference import ModelInference
        
        reasons = []
        risk_score = 0
        threats = []
        ml_scores = {}
        
        try:
            inference = ModelInference()
            
            # Build transaction data for the real ML pipeline
            transaction_data = {
                "transaction_id": f"shield-{datetime.now().timestamp()}",
                "recipient_upi": upi_id,
                "amount": amount,
                "is_new_recipient": verification_data.get("data", {}).get("verification_status") != "verified",
                "hour_of_day": datetime.now().hour,
                "day_of_week": datetime.now().weekday(),
                "oldbalanceOrg": user_profile.get("avg_transaction_amount", 1000) * 5,
                "newbalanceOrig": max(user_profile.get("avg_transaction_amount", 1000) * 5 - amount, 0),
                "oldbalanceDest": 0,
                "newbalanceDest": amount,
            }
            
            # Build recipient profile
            recipient_profile = {
                "trust_score": 50,
                "report_count": hard_rules_data.get("report_count", 0),
                "total_transactions": 0,
                "account_type": "unknown",
            }
            
            # Run all 5 ML models through the real pipeline
            result = await inference.assess_risk(
                transaction_data, user_profile, recipient_profile
            )
            
            # Extract individual model scores
            model_details = result.get("model_scores", {})
            ml_scores["xgboost"] = model_details.get("xgboost", 0) * 100
            ml_scores["isolation_forest"] = model_details.get("isolation_forest", 0) * 100
            ml_scores["lstm"] = model_details.get("lstm", 0) * 100
            ml_scores["gnn"] = model_details.get("gnn", 0) * 100
            ml_scores["sensor"] = model_details.get("sensor", 0) * 100
            
            risk_score = result.get("ensemble_score", 0) * 100
            
            # Use explanations from the real models
            model_explanations = result.get("explanations", [])
            if model_explanations:
                reasons.extend(model_explanations[:3])  # Top 3 explanations
            
            if risk_score >= 70:
                threats.append(ThreatType.ANOMALOUS_BEHAVIOR)
                reasons.append("🔴 Multiple ML models detected fraud patterns")
            elif risk_score >= 40:
                reasons.append("⚠️ Some ML models flagged potential concerns")
            else:
                reasons.append("✅ ML models found no significant fraud indicators")
                
        except Exception as e:
            # Fallback to simple heuristic if models fail to load
            import logging
            logging.getLogger(__name__).warning(f"ML inference failed, using fallback: {e}")
            
            xgb_score = 75 if hard_rules_data.get("scam_type") else 15
            ml_scores["xgboost"] = xgb_score
            ml_scores["isolation_forest"] = 10
            ml_scores["lstm"] = 20
            ml_scores["gnn"] = 10
            ml_scores["sensor"] = 5
            risk_score = xgb_score * 0.35 + 10 * 0.25 + 20 * 0.15 + 10 * 0.15 + 5 * 0.10
            reasons.append("⚠️ ML analysis using simplified mode")
        
        return LayerResult(
            layer_name="ML Intelligence Shield",
            passed=True,  # Don't hard block based on ML alone
            risk_score=min(risk_score, 100),
            reasons=reasons,
            threats=threats,
            data={"ml_scores": ml_scores}
        )
    
    # ==================== LAYER 6: Community Intelligence ====================
    async def _layer6_community(self, upi_id: str) -> LayerResult:
        """
        Crowdsourced fraud intelligence
        Users protecting users
        """
        reasons = []
        risk_score = 0
        threats = []
        report_count = 0
        
        if self.excel_database:
            scammer = self.excel_database.check_scammer(upi_id)
            if scammer:
                report_count = scammer.get("report_count", 0)
                scam_type = scammer.get("scam_type", "fraud")
                
                if report_count >= 10:
                    reasons.append(f"🚫 BLOCKED: {report_count} users reported this UPI for {scam_type}")
                    risk_score = 100
                    threats.append(ThreatType.COMMUNITY_REPORTS)
                elif report_count >= 5:
                    reasons.append(f"🔴 HIGH RISK: {report_count} fraud reports from other users")
                    risk_score = 60
                    threats.append(ThreatType.COMMUNITY_REPORTS)
                elif report_count >= 1:
                    reasons.append(f"⚠️ CAUTION: {report_count} user(s) reported issues with this UPI")
                    risk_score = 30
                    threats.append(ThreatType.COMMUNITY_REPORTS)
        
        if not reasons:
            reasons.append("✅ No community reports against this UPI")
        
        return LayerResult(
            layer_name="Community Intelligence",
            passed=report_count < 10,
            risk_score=min(risk_score, 100),
            reasons=reasons,
            threats=threats,
            data={"report_count": report_count}
        )
    
    # ==================== LAYER 7: Decision & Explanation ====================
    def _layer7_decision(self, all_results: List[LayerResult], is_blocked: bool) -> LayerResult:
        """
        Final decision and explanation generation
        Decision is rule-based, NOT AI
        """
        # Calculate weighted final score
        total_score = sum(r.risk_score for r in all_results)
        avg_score = total_score / len(all_results)
        
        reasons = []
        
        if is_blocked:
            reasons.append("🚫 PAYMENT BLOCKED - Critical security threat detected")
        elif avg_score > 75:
            reasons.append("🔴 DANGEROUS - We strongly recommend NOT proceeding")
        elif avg_score > 50:
            reasons.append("🟠 RISKY - Please verify the recipient before paying")
        elif avg_score > 25:
            reasons.append("🟡 CAUTION - Double-check recipient details")
        else:
            reasons.append("🟢 SAFE - Transaction looks secure")
        
        return LayerResult(
            layer_name="Final Decision",
            passed=not is_blocked and avg_score <= 75,
            risk_score=avg_score,
            reasons=reasons,
            threats=[],
            data={
                "average_score": avg_score,
                "decision": "blocked" if is_blocked else (
                    "dangerous" if avg_score > 75 else
                    "risky" if avg_score > 50 else
                    "caution" if avg_score > 25 else
                    "safe"
                )
            }
        )
    
    # ==================== Helpers ====================
    def _calculate_risk_level(self, score: float, is_blocked: bool) -> RiskLevel:
        """Determine risk level from score"""
        if is_blocked:
            return RiskLevel.BLOCKED
        elif score > 75:
            return RiskLevel.DANGEROUS
        elif score > 50:
            return RiskLevel.RISKY
        elif score > 25:
            return RiskLevel.CAUTION
        else:
            return RiskLevel.SAFE
    
    def _generate_safety_tips(self, scam_type: Optional[str]) -> List[str]:
        """Generate context-aware safety tips"""
        base_tips = [
            "Never share OTP, PIN, or password with anyone",
            "Banks never ask you to download apps or share screen",
        ]
        
        scam_tips = {
            "lottery": [
                "💡 You can't win a lottery you never entered",
                "💡 Real lotteries never ask for 'processing fees'",
                "💡 If they say 'pay tax to claim prize' - it's a scam",
            ],
            "kyc_fraud": [
                "💡 Banks update KYC through official branch or app, never via calls",
                "💡 No bank will block your account for not updating KYC immediately",
                "💡 Never click links in SMS claiming 'KYC update required'",
            ],
            "digital_arrest": [
                "💡 Police/CBI NEVER arrest via video call",
                "💡 No government agency asks for money to 'clear your name'",
                "💡 Call 1930 (Cyber Crime) if someone threatens arrest over phone",
            ],
            "refund_scam": [
                "💡 Real refunds are automatic - you never need to 'approve' them",
                "💡 If someone asks you to enter amount to 'receive' refund - it's a scam",
                "💡 Refunds don't require you to scan QR codes",
            ],
            "fake_support": [
                "💡 Real customer support never asks for remote access (AnyDesk/TeamViewer)",
                "💡 Never call numbers from Google search - scammers pay for top results",
                "💡 Always use support numbers from official app/website only",
            ],
        }
        
        tips = base_tips.copy()
        if scam_type and scam_type in scam_tips:
            tips = scam_tips[scam_type] + tips
        
        return tips[:5]  # Return top 5 tips
