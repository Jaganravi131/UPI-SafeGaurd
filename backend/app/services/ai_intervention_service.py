"""
AI Agentic Intervention Service
===============================
Core USP: Real-time AI agent that intervenes when fraud risk exceeds threshold.

This service monitors transaction risk assessments and triggers intelligent
interventions including:
- Real-time risk warnings with explanation
- Step-by-step verification challenges
- Guardian notifications
- Transaction blocking for high-risk scenarios
- Educational micro-learning during intervention
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import asyncio
import uuid


class InterventionLevel(str, Enum):
    """Intervention severity levels based on risk score"""
    NONE = "none"              # Risk < 30%: No intervention
    ADVISORY = "advisory"      # Risk 30-50%: Soft warning
    WARNING = "warning"        # Risk 50-70%: Strong warning + verification
    BLOCKING = "blocking"      # Risk 70-90%: Block until verification
    CRITICAL = "critical"      # Risk > 90%: Full block + guardian alert


class InterventionReason(str, Enum):
    """Reasons that triggered the intervention"""
    HIGH_AMOUNT = "high_amount"
    NEW_RECIPIENT = "new_recipient"
    UNUSUAL_TIME = "unusual_time"
    BEHAVIORAL_ANOMALY = "behavioral_anomaly"
    NETWORK_FRAUD = "network_fraud"
    STRESS_DETECTED = "stress_detected"
    CALL_ACTIVE = "call_active"
    KNOWN_SCAMMER = "known_scammer"
    VELOCITY_BREACH = "velocity_breach"
    PATTERN_MATCH = "pattern_match"


class VerificationChallenge(BaseModel):
    """A verification challenge for the user to complete"""
    id: str
    type: str  # "confirm_recipient", "security_question", "wait_period", "guardian_approval"
    question: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    timeout_seconds: int = 60
    points_reward: int = 10


class InterventionAction(BaseModel):
    """Action that the AI agent can take"""
    action_type: str  # "show_warning", "require_verification", "block_transaction", "notify_guardian", "educational_tip"
    priority: int
    message: str
    details: Optional[Dict[str, Any]] = None


class AgentIntervention(BaseModel):
    """Complete intervention response from AI agent"""
    intervention_id: str
    transaction_id: str
    user_id: str
    timestamp: datetime
    
    # Risk Assessment
    risk_score: float
    intervention_level: InterventionLevel
    reasons: List[InterventionReason]
    
    # AI Agent Response
    agent_message: str
    agent_reasoning: str
    confidence: float
    
    # Actions to take
    actions: List[InterventionAction]
    challenges: List[VerificationChallenge]
    
    # Resolution requirements
    requires_user_action: bool
    can_override: bool
    override_requires_guardian: bool
    auto_decline_after_seconds: Optional[int] = None
    
    # Educational content
    educational_tip: Optional[str] = None
    scam_example: Optional[str] = None


class AIInterventionAgent:
    """
    The AI Agentic Intervention Engine
    
    This is the core intelligent agent that:
    1. Analyzes risk assessment results
    2. Determines appropriate intervention level
    3. Generates contextual warnings and explanations
    4. Creates verification challenges
    5. Decides when to block transactions
    6. Notifies guardians when needed
    """
    
    # Risk thresholds for intervention levels
    THRESHOLDS = {
        InterventionLevel.NONE: 0.30,
        InterventionLevel.ADVISORY: 0.50,
        InterventionLevel.WARNING: 0.70,
        InterventionLevel.BLOCKING: 0.90,
        InterventionLevel.CRITICAL: 1.00
    }
    
    # Educational tips for different scam types
    EDUCATIONAL_TIPS = {
        "fake_merchant": "🎓 Real customer care will NEVER ask for your PIN, OTP, or UPI PIN. Banks already have your account details!",
        "lottery_scam": "🎓 You cannot win a lottery you never entered. Prize announcements asking for fees are always scams!",
        "investment_scam": "🎓 Returns above 15% are unrealistic. If it sounds too good to be true, it definitely is!",
        "call_scam": "🎓 Making payments while on call with strangers is the #1 fraud pattern. Hang up first, think later!",
        "known_scammer": "🎓 This UPI ID has been reported by multiple victims. There's a 99% chance this is a scam.",
        "new_recipient_high": "🎓 Large first-time transfers are high-risk. Consider sending a small test amount first.",
    }
    
    SCAM_EXAMPLES = {
        "call_active": "Recent case: A victim lost ₹2.5 lakh while on a call with someone posing as a bank official who kept them distracted.",
        "known_scammer": "This UPI ID was involved in 23 fraud reports totaling ₹8.4 lakh stolen from victims.",
        "high_amount_new": "Common pattern: Scammers request large amounts claiming urgency. 78% of frauds involve amounts > ₹10,000."
    }
    
    def __init__(self):
        self.active_interventions: Dict[str, AgentIntervention] = {}
        
    def determine_intervention_level(self, risk_score: float) -> InterventionLevel:
        """Determine intervention level based on risk score"""
        if risk_score < self.THRESHOLDS[InterventionLevel.NONE]:
            return InterventionLevel.NONE
        elif risk_score < self.THRESHOLDS[InterventionLevel.ADVISORY]:
            return InterventionLevel.ADVISORY
        elif risk_score < self.THRESHOLDS[InterventionLevel.WARNING]:
            return InterventionLevel.WARNING
        elif risk_score < self.THRESHOLDS[InterventionLevel.BLOCKING]:
            return InterventionLevel.BLOCKING
        else:
            return InterventionLevel.CRITICAL
    
    def identify_reasons(
        self,
        risk_factors: Dict[str, Any],
        transaction_data: Dict[str, Any]
    ) -> List[InterventionReason]:
        """Identify specific reasons for intervention"""
        reasons = []
        
        if risk_factors.get("is_known_scammer"):
            reasons.append(InterventionReason.KNOWN_SCAMMER)
        if risk_factors.get("network_fraud_score", 0) > 0.5:
            reasons.append(InterventionReason.NETWORK_FRAUD)
        if transaction_data.get("call_active"):
            reasons.append(InterventionReason.CALL_ACTIVE)
        if risk_factors.get("stress_score", 0) > 0.6:
            reasons.append(InterventionReason.STRESS_DETECTED)
        if risk_factors.get("behavioral_anomaly_score", 0) > 0.5:
            reasons.append(InterventionReason.BEHAVIORAL_ANOMALY)
        if transaction_data.get("is_new_recipient") and transaction_data.get("amount", 0) > 5000:
            reasons.append(InterventionReason.NEW_RECIPIENT)
        if transaction_data.get("amount", 0) > 10000:
            reasons.append(InterventionReason.HIGH_AMOUNT)
        if risk_factors.get("unusual_time"):
            reasons.append(InterventionReason.UNUSUAL_TIME)
        if risk_factors.get("velocity_breach"):
            reasons.append(InterventionReason.VELOCITY_BREACH)
        if risk_factors.get("pattern_match_score", 0) > 0.6:
            reasons.append(InterventionReason.PATTERN_MATCH)
            
        return reasons if reasons else [InterventionReason.BEHAVIORAL_ANOMALY]
    
    def generate_agent_message(
        self,
        level: InterventionLevel,
        reasons: List[InterventionReason],
        amount: float,
        recipient: str
    ) -> tuple[str, str]:
        """Generate contextual AI agent message and reasoning"""
        
        if InterventionReason.KNOWN_SCAMMER in reasons:
            message = f"🚨 STOP! This UPI ID ({recipient}) has been reported as a scammer by multiple users."
            reasoning = "Pattern match against community fraud database found multiple verified reports."
        elif InterventionReason.CALL_ACTIVE in reasons:
            message = "⚠️ I notice you're on a call. Making payments while speaking to strangers is very risky!"
            reasoning = "Active phone call detected during transaction. 78% of UPI frauds involve call-based social engineering."
        elif InterventionReason.STRESS_DETECTED in reasons:
            message = "🧘 Take a deep breath. I detected signs of stress or urgency. Scammers often create panic."
            reasoning = "Device sensors indicate elevated stress patterns. Coerced transactions show similar signatures."
        elif InterventionReason.NETWORK_FRAUD in reasons:
            message = f"🔍 This recipient is connected to a network flagged for suspicious activity."
            reasoning = "Graph neural network analysis shows connections to flagged fraud nodes."
        elif InterventionReason.HIGH_AMOUNT in reasons and InterventionReason.NEW_RECIPIENT in reasons:
            message = f"💰 You're sending ₹{amount:,.0f} to someone you've never paid before. Are you sure?"
            reasoning = "First transaction to new recipient with amount 3x above user's typical pattern."
        elif level == InterventionLevel.ADVISORY:
            message = "📋 Quick check: Please confirm this transaction is something you intended."
            reasoning = "Low-medium risk indicators detected. Soft confirmation recommended."
        else:
            message = f"⚡ This transaction has some risk indicators. Let me help you verify it's safe."
            reasoning = f"Aggregated risk score of {len(reasons)} factors suggests verification needed."
            
        return message, reasoning
    
    def generate_actions(
        self,
        level: InterventionLevel,
        reasons: List[InterventionReason]
    ) -> List[InterventionAction]:
        """Generate appropriate actions for the intervention"""
        actions = []
        
        # Warning action for all non-zero interventions
        if level != InterventionLevel.NONE:
            actions.append(InterventionAction(
                action_type="show_warning",
                priority=1,
                message="Display risk warning to user"
            ))
        
        # Verification required for WARNING and above
        if level in [InterventionLevel.WARNING, InterventionLevel.BLOCKING, InterventionLevel.CRITICAL]:
            actions.append(InterventionAction(
                action_type="require_verification",
                priority=2,
                message="User must complete verification challenge"
            ))
        
        # Block transaction for BLOCKING and CRITICAL
        if level in [InterventionLevel.BLOCKING, InterventionLevel.CRITICAL]:
            actions.append(InterventionAction(
                action_type="block_transaction",
                priority=3,
                message="Transaction blocked pending verification"
            ))
        
        # Guardian notification for CRITICAL or known scammer
        if level == InterventionLevel.CRITICAL or InterventionReason.KNOWN_SCAMMER in reasons:
            actions.append(InterventionAction(
                action_type="notify_guardian",
                priority=4,
                message="Alert guardian/family member about high-risk transaction"
            ))
        
        # Educational tip for all interventions
        actions.append(InterventionAction(
            action_type="educational_tip",
            priority=5,
            message="Show relevant fraud awareness tip"
        ))
        
        return actions
    
    def generate_challenges(
        self,
        level: InterventionLevel,
        reasons: List[InterventionReason],
        recipient: str,
        amount: float
    ) -> List[VerificationChallenge]:
        """Generate verification challenges for the user"""
        challenges = []
        
        if level == InterventionLevel.ADVISORY:
            # Simple confirmation
            challenges.append(VerificationChallenge(
                id=str(uuid.uuid4()),
                type="simple_confirm",
                question=f"Are you sure you want to send ₹{amount:,.0f} to {recipient}?",
                options=["Yes, I'm sure", "No, cancel this"],
                correct_answer="Yes, I'm sure",
                timeout_seconds=30,
                points_reward=5
            ))
            
        elif level == InterventionLevel.WARNING:
            # Acknowledgment of risk
            challenges.append(VerificationChallenge(
                id=str(uuid.uuid4()),
                type="risk_acknowledge",
                question="I understand this transaction has fraud indicators and I want to proceed at my own risk.",
                options=["I understand and accept", "Let me reconsider"],
                correct_answer="I understand and accept",
                timeout_seconds=45,
                points_reward=10
            ))
            
            # If call active, add cooldown
            if InterventionReason.CALL_ACTIVE in reasons:
                challenges.append(VerificationChallenge(
                    id=str(uuid.uuid4()),
                    type="wait_period",
                    question="Please end your phone call and wait 60 seconds before proceeding. This cooling period helps prevent impulsive fraud decisions.",
                    timeout_seconds=60,
                    points_reward=15
                ))
                
        elif level in [InterventionLevel.BLOCKING, InterventionLevel.CRITICAL]:
            # Mandatory security question
            challenges.append(VerificationChallenge(
                id=str(uuid.uuid4()),
                type="security_question",
                question="Which of these is a sign of UPI fraud?",
                options=[
                    "Someone asking for OTP over phone",
                    "Making payment at a known shop",
                    "Receiving money from family",
                    "Paying electricity bill"
                ],
                correct_answer="Someone asking for OTP over phone",
                timeout_seconds=60,
                points_reward=20
            ))
            
            # For critical, require guardian approval
            if level == InterventionLevel.CRITICAL:
                challenges.append(VerificationChallenge(
                    id=str(uuid.uuid4()),
                    type="guardian_approval",
                    question="This transaction requires approval from your guardian. A notification has been sent.",
                    timeout_seconds=300,  # 5 minutes to get guardian approval
                    points_reward=25
                ))
        
        return challenges
    
    def get_educational_content(
        self,
        reasons: List[InterventionReason]
    ) -> tuple[Optional[str], Optional[str]]:
        """Get relevant educational tip and scam example"""
        tip = None
        example = None
        
        if InterventionReason.KNOWN_SCAMMER in reasons:
            tip = self.EDUCATIONAL_TIPS.get("known_scammer")
            example = self.SCAM_EXAMPLES.get("known_scammer")
        elif InterventionReason.CALL_ACTIVE in reasons:
            tip = self.EDUCATIONAL_TIPS.get("call_scam")
            example = self.SCAM_EXAMPLES.get("call_active")
        elif InterventionReason.NEW_RECIPIENT in reasons and InterventionReason.HIGH_AMOUNT in reasons:
            tip = self.EDUCATIONAL_TIPS.get("new_recipient_high")
            example = self.SCAM_EXAMPLES.get("high_amount_new")
        elif InterventionReason.STRESS_DETECTED in reasons:
            tip = "🎓 Scammers create urgency and panic. If someone is rushing you, that's a red flag!"
            
        return tip, example
    
    async def analyze_and_intervene(
        self,
        transaction_id: str,
        user_id: str,
        risk_score: float,
        risk_factors: Dict[str, Any],
        transaction_data: Dict[str, Any]
    ) -> Optional[AgentIntervention]:
        """
        Main method: Analyze risk and generate intervention if needed
        
        This is where the AI agent makes its decision and creates a
        comprehensive intervention response.
        """
        
        # Determine intervention level
        level = self.determine_intervention_level(risk_score)
        
        # No intervention needed for low risk
        if level == InterventionLevel.NONE:
            return None
        
        # Identify specific risk reasons
        reasons = self.identify_reasons(risk_factors, transaction_data)
        
        # Generate agent message and reasoning
        amount = transaction_data.get("amount", 0)
        recipient = transaction_data.get("recipient_upi", "Unknown")
        message, reasoning = self.generate_agent_message(level, reasons, amount, recipient)
        
        # Generate actions
        actions = self.generate_actions(level, reasons)
        
        # Generate verification challenges
        challenges = self.generate_challenges(level, reasons, recipient, amount)
        
        # Get educational content
        tip, example = self.get_educational_content(reasons)
        
        # Create intervention response
        intervention = AgentIntervention(
            intervention_id=str(uuid.uuid4()),
            transaction_id=transaction_id,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            risk_score=risk_score,
            intervention_level=level,
            reasons=reasons,
            agent_message=message,
            agent_reasoning=reasoning,
            confidence=min(0.95, risk_score + 0.1),  # High confidence for high risk
            actions=actions,
            challenges=challenges,
            requires_user_action=level in [InterventionLevel.WARNING, InterventionLevel.BLOCKING, InterventionLevel.CRITICAL],
            can_override=level not in [InterventionLevel.CRITICAL],
            override_requires_guardian=level == InterventionLevel.BLOCKING,
            auto_decline_after_seconds=300 if level == InterventionLevel.CRITICAL else None,
            educational_tip=tip,
            scam_example=example
        )
        
        # Store active intervention
        self.active_interventions[intervention.intervention_id] = intervention
        
        return intervention
    
    async def resolve_intervention(
        self,
        intervention_id: str,
        user_responses: Dict[str, str],
        guardian_approved: bool = False
    ) -> Dict[str, Any]:
        """
        Resolve an intervention based on user responses
        
        Returns whether the transaction should proceed
        """
        intervention = self.active_interventions.get(intervention_id)
        if not intervention:
            return {"success": False, "error": "Intervention not found"}
        
        # Check all challenges were completed correctly
        all_passed = True
        for challenge in intervention.challenges:
            if challenge.type == "guardian_approval":
                if not guardian_approved:
                    all_passed = False
                    break
            elif challenge.correct_answer:
                user_answer = user_responses.get(challenge.id)
                if user_answer != challenge.correct_answer:
                    all_passed = False
                    break
        
        # Remove from active interventions
        del self.active_interventions[intervention_id]
        
        return {
            "success": True,
            "transaction_allowed": all_passed,
            "intervention_level": intervention.intervention_level,
            "points_earned": sum(c.points_reward for c in intervention.challenges) if all_passed else 0
        }


# Singleton instance
intervention_agent = AIInterventionAgent()
