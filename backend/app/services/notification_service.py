"""
Notification Service
Handles alerts, notifications, and voice alerts
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
from uuid import UUID
import asyncio

from app.ml.pipeline import ExplanationGenerator


class NotificationService:
    """Service for managing user notifications and alerts"""
    
    def __init__(self):
        self.explanation_generator = ExplanationGenerator()
        # In-memory notification store for demo (use Redis in production)
        self.notifications: Dict[str, List[Dict]] = {}
    
    async def create_notification(
        self,
        user_id: str,
        notification_type: str,
        title: str,
        message: str,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a new notification for user"""
        notification = {
            "id": str(datetime.now().timestamp()),
            "user_id": user_id,
            "type": notification_type,
            "title": title,
            "message": message,
            "data": data or {},
            "read": False,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        if user_id not in self.notifications:
            self.notifications[user_id] = []
        
        self.notifications[user_id].insert(0, notification)
        
        # Keep only last 100 notifications
        self.notifications[user_id] = self.notifications[user_id][:100]
        
        return notification
    
    async def get_user_notifications(
        self,
        user_id: str,
        notification_type: Optional[str] = None,
        unread_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Get notifications for a user"""
        notifications = self.notifications.get(user_id, [])
        
        if notification_type:
            notifications = [n for n in notifications if n["type"] == notification_type]
        
        if unread_only:
            notifications = [n for n in notifications if not n["read"]]
        
        return notifications
    
    async def mark_as_read(self, user_id: str, notification_id: str):
        """Mark notification as read"""
        notifications = self.notifications.get(user_id, [])
        for notification in notifications:
            if notification["id"] == notification_id:
                notification["read"] = True
                break
    
    async def mark_all_as_read(self, user_id: str):
        """Mark all notifications as read"""
        notifications = self.notifications.get(user_id, [])
        for notification in notifications:
            notification["read"] = True
    
    async def send_risk_alert(
        self,
        user_id: str,
        risk_level: str,
        risk_score: float,
        risk_factors: List[str],
        transaction_id: str
    ):
        """Send risk alert notification"""
        titles = {
            "low": "Transaction Safe",
            "medium": "Potential Risk Detected",
            "high": "High Risk Alert",
            "critical": "🚨 Critical Security Alert",
        }
        
        await self.create_notification(
            user_id=user_id,
            notification_type="security",
            title=titles.get(risk_level, "Risk Alert"),
            message=f"AI detected {risk_level} risk ({int(risk_score * 100)}% confidence). "
                   f"Factors: {', '.join(risk_factors[:3])}",
            data={
                "transaction_id": transaction_id,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "risk_factors": risk_factors,
            }
        )
    
    async def send_guardian_request(
        self,
        guardian_id: str,
        user_name: str,
        transaction_data: Dict[str, Any],
        risk_assessment: Dict[str, Any]
    ):
        """Send approval request to guardian"""
        await self.create_notification(
            user_id=guardian_id,
            notification_type="guardian_approval",
            title=f"Approval Request from {user_name}",
            message=f"{user_name} wants to send ₹{transaction_data.get('amount')} to "
                   f"{transaction_data.get('recipient_upi')}. Risk level: "
                   f"{risk_assessment.get('risk_level', 'unknown')}",
            data={
                "user_name": user_name,
                "transaction": transaction_data,
                "risk_assessment": risk_assessment,
                "action_required": True,
            }
        )
    
    def generate_voice_alert(
        self,
        alert_type: str,
        language: str = "english",
        context: Optional[Dict] = None
    ) -> str:
        """Generate voice alert text in specified language"""
        return self.explanation_generator.generate_voice_alert(
            alert_type, language, context or {}
        )
    
    async def send_fraud_warning(
        self,
        user_id: str,
        upi_id: str,
        report_count: int
    ):
        """Send fraud warning notification"""
        await self.create_notification(
            user_id=user_id,
            notification_type="security",
            title="⚠️ Fraud Warning",
            message=f"The UPI ID {upi_id} has been reported {report_count} times "
                   f"for fraud. Do not proceed with this transaction.",
            data={
                "upi_id": upi_id,
                "report_count": report_count,
                "action": "block_recommended",
            }
        )
    
    async def send_educational_tip(
        self,
        user_id: str,
        tip_category: str
    ):
        """Send educational security tip"""
        tips = {
            "qr_scam": {
                "title": "🎓 Security Tip: QR Code Scams",
                "message": "QR codes are for PAYING, not receiving. "
                          "Never scan a QR code someone sends claiming to send you money.",
            },
            "call_scam": {
                "title": "🎓 Security Tip: Phone Call Scams",
                "message": "Banks NEVER call and ask you to make payments or share OTP. "
                          "If someone claims to be from bank, hang up and call official number.",
            },
            "kyc_scam": {
                "title": "🎓 Security Tip: Fake KYC",
                "message": "Banks never send SMS with links for KYC. "
                          "Always use official app or visit bank branch for KYC.",
            },
        }
        
        tip = tips.get(tip_category)
        if tip:
            await self.create_notification(
                user_id=user_id,
                notification_type="tip",
                title=tip["title"],
                message=tip["message"],
                data={"category": tip_category}
            )


# Singleton instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get or create notification service instance"""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
