"""
Challenge/Gamification API Routes
Handles security challenges and user education
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID, uuid4

from app.db.database import get_db
from app.db.models import Challenge, ChallengeProgress, User

router = APIRouter(prefix="/challenges", tags=["Challenges"])

# Sample challenges data
SAMPLE_CHALLENGES = [
    {
        "id": str(uuid4()),
        "title": "Spot the QR Scam",
        "category": "qr_code",
        "difficulty": "beginner",
        "scenario": "You're selling a phone on OLX for ₹15,000. A buyer says: 'I'll pay now. Scan this QR code to receive ₹15,000 instantly.' What should you do?",
        "options": [
            "Scan the QR code to receive the money",
            "Ask them to pay directly to your UPI ID",
            "QR codes can only be used to PAY money, not receive. This is a scam!",
            "Ask for a different QR code"
        ],
        "correct_answer": 2,
        "explanation": "QR codes are ONLY for PAYING money, never for receiving! When you scan a QR code, money goes OUT of your account. Scammers trick people by saying 'scan to receive money'. Always remember: To receive money, share your UPI ID - never scan any QR code.",
        "points": 10
    },
    {
        "id": str(uuid4()),
        "title": "The Fake Bank Call",
        "category": "phone_call",
        "difficulty": "beginner",
        "scenario": "You receive a call: 'Sir, this is from SBI Bank. Your account will be blocked in 2 hours due to KYC issues. Please share your OTP to verify your account.' What do you do?",
        "options": [
            "Share the OTP quickly to save your account",
            "Ask them to call back later",
            "Hang up immediately - banks NEVER ask for OTP on calls",
            "Give them your ATM PIN instead"
        ],
        "correct_answer": 2,
        "explanation": "Banks NEVER call and ask for OTP, PIN, or passwords. This is 100% a scam! Real banks will ask you to visit the branch or use official app. If someone claims to be from bank and asks for OTP - it's always a scam. Hang up and call your bank's official number if worried.",
        "points": 10
    },
    {
        "id": str(uuid4()),
        "title": "The Digital Arrest Scam",
        "category": "digital_arrest",
        "difficulty": "advanced",
        "scenario": "You get a video call from someone in police uniform claiming you're involved in money laundering. They say: 'Pay ₹50,000 as security deposit or we'll arrest you. Don't tell anyone or disconnect.' What should you do?",
        "options": [
            "Pay immediately to avoid arrest",
            "Ask for more time to arrange money",
            "This is the 'Digital Arrest' scam - no such thing exists. Hang up and report to 1930",
            "Transfer half the amount first"
        ],
        "correct_answer": 2,
        "explanation": "Digital Arrest is a SCAM - there's no such legal procedure! Police never demand money on video calls. They cannot 'digitally arrest' anyone. Scammers dress as police/CBI to scare victims. If this happens: 1) Hang up immediately, 2) Don't pay anything, 3) Report to Cyber Crime helpline 1930.",
        "points": 15
    },
    {
        "id": str(uuid4()),
        "title": "Remote Access Trap",
        "category": "remote_access",
        "difficulty": "intermediate",
        "scenario": "Someone calls claiming to be from 'customer support' and says: 'Your UPI is not working. Install AnyDesk app and share the code - I'll fix it remotely.' What's the right action?",
        "options": [
            "Install AnyDesk and share the code",
            "Ask them to fix without remote access",
            "Never install remote access apps for strangers - this gives them control of your phone!",
            "Share screen but not code"
        ],
        "correct_answer": 2,
        "explanation": "Remote access apps like AnyDesk give COMPLETE control of your phone! Scammers can then: See your OTPs, Access your bank apps, Make payments from your accounts. NO legitimate support will ever ask you to install such apps. If UPI isn't working, contact your bank directly.",
        "points": 12
    },
    {
        "id": str(uuid4()),
        "title": "The Lucky Winner",
        "category": "lottery",
        "difficulty": "beginner",
        "scenario": "You receive a message: 'Congratulations! You've won ₹10,00,000 in Jio Lucky Draw! Pay ₹5,000 processing fee to claim your prize.' What's the truth?",
        "options": [
            "Pay the fee to claim the prize",
            "Ask if you can pay less",
            "This is a lottery scam - you can't win a contest you never entered!",
            "Check if Jio really has this offer"
        ],
        "correct_answer": 2,
        "explanation": "You cannot win a lottery or contest you never entered! All such messages are scams. Real prizes never require you to pay first. Companies like Jio don't run such SMS lottery schemes. If you need to pay to 'receive' money - it's always a scam!",
        "points": 10
    }
]


@router.get("/list")
async def list_challenges(
    category: Optional[str] = None,
    difficulty: Optional[str] = None
):
    """List available challenges"""
    challenges = SAMPLE_CHALLENGES.copy()
    
    if category:
        challenges = [c for c in challenges if c["category"] == category]
    
    if difficulty:
        challenges = [c for c in challenges if c["difficulty"] == difficulty]
    
    # Don't expose correct answer in list
    return [
        {
            "id": c["id"],
            "title": c["title"],
            "category": c["category"],
            "difficulty": c["difficulty"],
            "points": c["points"],
        }
        for c in challenges
    ]


@router.get("/daily")
async def get_daily_challenge(
    user_id: str = None
):
    """Get personalized daily challenge"""
    # For demo, return a random challenge
    import random
    challenge = random.choice(SAMPLE_CHALLENGES)
    
    return {
        "id": challenge["id"],
        "title": challenge["title"],
        "category": challenge["category"],
        "difficulty": challenge["difficulty"],
        "scenario": challenge["scenario"],
        "options": challenge["options"],
        "points": challenge["points"],
        "ai_recommendation": "Based on trending scams, we recommend practicing this scenario"
    }


@router.get("/{challenge_id}")
async def get_challenge(challenge_id: str):
    """Get a specific challenge"""
    challenge = next((c for c in SAMPLE_CHALLENGES if c["id"] == challenge_id), None)
    
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    
    return {
        "id": challenge["id"],
        "title": challenge["title"],
        "category": challenge["category"],
        "difficulty": challenge["difficulty"],
        "scenario": challenge["scenario"],
        "options": challenge["options"],
        "points": challenge["points"],
    }


@router.post("/{challenge_id}/submit")
async def submit_challenge_answer(
    challenge_id: str,
    answer: int,
    time_taken: int = 0,
    db: AsyncSession = Depends(get_db),
    user_id: str = None
):
    """Submit answer for a challenge"""
    challenge = next((c for c in SAMPLE_CHALLENGES if c["id"] == challenge_id), None)
    
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    
    is_correct = answer == challenge["correct_answer"]
    points_earned = challenge["points"] if is_correct else 0
    
    # Update user's education score
    if user_id and user_id != "demo-user":
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.education_score = min(100, user.education_score + (points_earned / 10))
            await db.commit()
    
    return {
        "correct": is_correct,
        "correct_answer": challenge["correct_answer"],
        "explanation": challenge["explanation"],
        "points_earned": points_earned,
        "total_points": points_earned,  # Would accumulate in production
    }


@router.get("/categories/list")
async def list_categories():
    """List challenge categories"""
    return [
        {"id": "qr_code", "name": "QR Code Scams", "description": "Learn to identify QR code fraud attempts"},
        {"id": "phone_call", "name": "Phone Call Scams", "description": "Recognize fake bank and KYC calls"},
        {"id": "digital_arrest", "name": "Digital Arrest", "description": "Understand the digital arrest scam"},
        {"id": "remote_access", "name": "Remote Access Scams", "description": "Avoid screen sharing traps"},
        {"id": "lottery", "name": "Lottery & Prize Scams", "description": "Spot fake winning announcements"},
        {"id": "job_scam", "name": "Job Scams", "description": "Identify fraudulent job offers"},
    ]


@router.get("/leaderboard")
async def get_leaderboard(
    db: AsyncSession = Depends(get_db)
):
    """Get challenge leaderboard"""
    # For demo, return sample data
    return {
        "leaderboard": [
            {"rank": 1, "name": "Rahul S.", "points": 450, "streak": 15},
            {"rank": 2, "name": "Priya M.", "points": 380, "streak": 12},
            {"rank": 3, "name": "Amit K.", "points": 320, "streak": 8},
            {"rank": 4, "name": "Sneha R.", "points": 290, "streak": 7},
            {"rank": 5, "name": "Vijay P.", "points": 250, "streak": 5},
        ],
        "user_rank": 42,
        "user_points": 120,
        "user_streak": 3
    }


@router.get("/badges")
async def get_badges(user_id: str = None):
    """Get user's badges and achievements"""
    return {
        "earned": [
            {"id": "first_challenge", "name": "First Steps", "description": "Complete your first challenge", "icon": "🎯"},
            {"id": "streak_3", "name": "Consistent Learner", "description": "3-day streak", "icon": "🔥"},
        ],
        "available": [
            {"id": "scam_spotter", "name": "Scam Spotter", "description": "Complete 10 challenges", "icon": "🔍", "progress": 3, "total": 10},
            {"id": "ai_star", "name": "AI's Star Student", "description": "90% accuracy", "icon": "⭐", "progress": 75, "total": 90},
            {"id": "streak_7", "name": "Streak Master", "description": "7-day streak", "icon": "🏆", "progress": 3, "total": 7},
        ]
    }
