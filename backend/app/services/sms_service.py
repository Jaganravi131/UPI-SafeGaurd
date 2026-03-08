"""
SMS Service for OTP delivery
- Uses Twilio for real phone numbers
- Returns OTP directly for demo/test numbers (from contacts database)
"""
from typing import Tuple, Optional
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Demo phone numbers from contacts database - OTP shown on screen
DEMO_PHONE_NUMBERS = {
    "9876543210", "9876543211", "9876543212", "9876543213", 
    "9876543214", "9876543215", "9876543216", "9876543217",
    "9876543218", "9876543219", "9876543220"
}


def is_demo_number(phone: str) -> bool:
    """Check if phone number is a demo/test number"""
    clean_phone = phone.replace('+91', '').replace(' ', '').replace('-', '')
    return clean_phone in DEMO_PHONE_NUMBERS


def send_otp_sms(phone: str, otp: str) -> Tuple[bool, str, Optional[str]]:
    """
    Send OTP via SMS
    
    Args:
        phone: Phone number (with or without +91)
        otp: 6-digit OTP code
    
    Returns:
        Tuple of (success: bool, message: str, display_otp: Optional[str])
        - display_otp is returned for demo numbers to show on frontend
    """
    clean_phone = phone.replace(' ', '').replace('-', '')
    if not clean_phone.startswith('+91'):
        clean_phone = '+91' + clean_phone.replace('+91', '')
    
    # Check if demo number
    if is_demo_number(phone):
        logger.info(f"Demo number detected: {phone}, OTP: {otp}")
        return True, "Demo OTP generated", otp
    
    # Real number - use Twilio
    if not all([settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_PHONE_NUMBER]):
        logger.warning("Twilio credentials not configured, falling back to demo mode")
        return True, "Twilio not configured - showing OTP", otp
    
    try:
        from twilio.rest import Client
        
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        message = client.messages.create(
            body=f"Your UPI SafeGuard verification code is: {otp}. Valid for 5 minutes. Do not share this code.",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=clean_phone
        )
        
        logger.info(f"SMS sent to {clean_phone}, SID: {message.sid}")
        return True, "OTP sent to your mobile number", None
        
    except Exception as e:
        logger.error(f"Twilio SMS failed: {str(e)}")
        # Don't leak OTP on real number failure
        return False, "SMS delivery failed. Please try again.", None


def format_phone_display(phone: str) -> str:
    """Format phone for display (masked)"""
    clean = phone.replace('+91', '').replace(' ', '').replace('-', '')
    if len(clean) >= 10:
        return f"+91 ****{clean[-4:]}"
    return phone
