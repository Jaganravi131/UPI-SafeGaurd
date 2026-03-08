"""
Explanation Generator
Generates human-readable explanations for ML model outputs
"""
from typing import Dict, List, Any, Optional


class ExplanationGenerator:
    """
    Generates human-readable explanations for ML risk assessments.
    Supports multiple languages for voice alerts.
    """
    
    # Risk factor templates in English
    RISK_TEMPLATES = {
        "high_amount": {
            "title": "High Transaction Amount",
            "description": "This amount (₹{amount}) is {ratio}x your usual transaction amount",
            "severity": "medium",
        },
        "new_recipient": {
            "title": "New Recipient",
            "description": "You have never transacted with this UPI ID before",
            "severity": "low",
        },
        "reported_recipient": {
            "title": "Fraud Reports",
            "description": "This UPI ID has been reported {count} times for fraud",
            "severity": "high",
        },
        "fraud_connection": {
            "title": "Fraud Network Connection",
            "description": "This recipient is connected to known fraudsters",
            "severity": "critical",
        },
        "call_active": {
            "title": "Active Phone Call",
            "description": "You're on a call. 90% of UPI frauds happen during scam calls",
            "severity": "high",
        },
        "unusual_time": {
            "title": "Unusual Time",
            "description": "Transaction at {hour}:00 is unusual for your pattern",
            "severity": "low",
        },
        "high_velocity": {
            "title": "Multiple Transactions",
            "description": "{count} transactions in the last hour is unusual for you",
            "severity": "medium",
        },
        "coercion_detected": {
            "title": "Stress Indicators",
            "description": "Our AI detected signs of possible stress or pressure",
            "severity": "high",
        },
        "low_trust_score": {
            "title": "Low Trust Score",
            "description": "This recipient has a low trust score ({score}/100)",
            "severity": "medium",
        },
        "mule_account": {
            "title": "Suspected Mule Account",
            "description": "This account shows patterns of a money laundering mule",
            "severity": "critical",
        },
    }
    
    # Voice alert templates in multiple languages
    VOICE_TEMPLATES = {
        "english": {
            "high_risk": "Warning! Our AI has detected high risk in this transaction. "
                        "Please verify carefully before proceeding.",
            "fraud_recipient": "Stop! This UPI ID has been reported for fraud. "
                              "Do not proceed with this payment.",
            "call_warning": "You are on a phone call. Remember, banks never ask "
                           "for payments during calls. This could be a scam.",
            "amount_warning": "This amount is {ratio} times your usual transaction. "
                             "Please verify this is correct.",
        },
        "hindi": {
            "high_risk": "चेतावनी! हमारी AI ने इस लेन-देन में उच्च जोखिम का पता लगाया है। "
                        "कृपया आगे बढ़ने से पहले सावधानी से जांच करें।",
            "fraud_recipient": "रुकें! इस UPI ID की धोखाधड़ी के लिए रिपोर्ट की गई है। "
                              "इस भुगतान के साथ आगे न बढ़ें।",
            "call_warning": "आप फोन पर हैं। याद रखें, बैंक कभी भी कॉल के दौरान "
                           "भुगतान नहीं मांगते। यह एक घोटाला हो सकता है।",
            "amount_warning": "यह राशि आपके सामान्य लेन-देन से {ratio} गुना है। "
                             "कृपया सत्यापित करें कि यह सही है।",
        },
        "tamil": {
            "high_risk": "எச்சரிக்கை! எங்கள் AI இந்த பரிவர்த்தனையில் அதிக ஆபத்தை கண்டறிந்துள்ளது। "
                        "தொடர்வதற்கு முன் கவனமாக சரிபார்க்கவும்.",
            "fraud_recipient": "நிறுத்துங்கள்! இந்த UPI ID மோசடிக்காக புகாரளிக்கப்பட்டுள்ளது। "
                              "இந்த கட்டணத்தை தொடரவேண்டாம்.",
            "call_warning": "நீங்கள் தொலைபேசியில் இருக்கிறீர்கள். நினைவில் கொள்ளுங்கள், "
                           "வங்கிகள் அழைப்புகளின் போது கட்டணங்களை கேட்பதில்லை.",
            "amount_warning": "இந்த தொகை உங்கள் வழக்கமான பரிவர்த்தனையை விட {ratio} மடங்கு அதிகம்.",
        },
        "telugu": {
            "high_risk": "హెచ్చరిక! మా AI ఈ లావాదేవీలో అధిక ప్రమాదాన్ని గుర్తించింది। "
                        "దయచేసి కొనసాగించడానికి ముందు జాగ్రత్తగా ధృవీకరించండి.",
            "fraud_recipient": "ఆపండి! ఈ UPI ID మోసానికి నివేదించబడింది. "
                              "ఈ చెల్లింపుతో కొనసాగవద్దు.",
            "call_warning": "మీరు ఫోన్ కాల్‌లో ఉన్నారు. గుర్తుంచుకోండి, బ్యాంకులు కాల్స్ సమయంలో "
                           "చెల్లింపులు అడగవు.",
            "amount_warning": "ఈ మొత్తం మీ సాధారణ లావాదేవీ కంటే {ratio} రెట్లు ఎక్కువ.",
        },
    }
    
    def __init__(self):
        self.supported_languages = list(self.VOICE_TEMPLATES.keys())
    
    def generate_risk_explanation(
        self,
        risk_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate detailed explanation for a risk factor"""
        template = self.RISK_TEMPLATES.get(risk_type)
        
        if not template:
            return {
                "title": "Risk Factor",
                "description": f"Potential risk detected: {risk_type}",
                "severity": "medium",
            }
        
        return {
            "title": template["title"],
            "description": template["description"].format(**context),
            "severity": template["severity"],
        }
    
    def generate_summary(
        self,
        risk_level: str,
        risk_score: float,
        risk_factors: List[str],
        model_scores: Dict[str, float]
    ) -> str:
        """Generate human-readable summary of risk assessment"""
        
        summaries = {
            "low": "Transaction appears safe based on our AI analysis.",
            "medium": "Some potential concerns detected. Please verify details carefully.",
            "high": "Our AI has flagged serious concerns with this transaction.",
            "critical": "CRITICAL ALERT: High probability of fraud detected.",
        }
        
        summary = summaries.get(risk_level, "Risk assessment complete.")
        
        if risk_factors:
            summary += f" Key concerns: {', '.join(risk_factors[:3])}."
        
        summary += f" (Confidence: {int(risk_score * 100)}%)"
        
        return summary
    
    def generate_voice_alert(
        self,
        alert_type: str,
        language: str = "english",
        context: Dict[str, Any] = None
    ) -> str:
        """Generate voice alert text in specified language"""
        context = context or {}
        
        lang_templates = self.VOICE_TEMPLATES.get(
            language, self.VOICE_TEMPLATES["english"]
        )
        
        template = lang_templates.get(alert_type, lang_templates.get("high_risk", ""))
        
        try:
            return template.format(**context)
        except KeyError:
            return template
    
    def generate_action_explanation(
        self,
        action: str,
        delay_seconds: int,
        risk_level: str
    ) -> str:
        """Generate explanation for recommended action"""
        
        explanations = {
            "proceed": "You may proceed with this transaction.",
            "delay": f"For your safety, please wait {delay_seconds} seconds before proceeding. "
                    f"This gives you time to verify the details.",
            "block": "This transaction has been blocked for your protection. "
                    "If you believe this is an error, please contact support.",
            "guardian_approval": "This transaction requires approval from your guardian "
                                "due to the risk level detected.",
        }
        
        return explanations.get(action, "Please review the transaction carefully.")
    
    def format_risk_factors_for_display(
        self,
        factors: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:
        """Format risk factors for UI display"""
        formatted = []
        
        severity_icons = {
            "critical": "🚨",
            "high": "⚠️",
            "medium": "⚡",
            "low": "ℹ️",
        }
        
        severity_colors = {
            "critical": "#e53e3e",
            "high": "#dd6b20",
            "medium": "#d69e2e",
            "low": "#3182ce",
        }
        
        for factor in factors:
            severity = factor.get("severity", "medium")
            formatted.append({
                "icon": severity_icons.get(severity, "ℹ️"),
                "title": factor.get("title", "Risk Factor"),
                "description": factor.get("description", ""),
                "color": severity_colors.get(severity, "#718096"),
                "severity": severity,
            })
        
        # Sort by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        formatted.sort(key=lambda x: severity_order.get(x["severity"], 4))
        
        return formatted
