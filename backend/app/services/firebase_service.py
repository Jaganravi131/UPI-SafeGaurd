"""
Firebase Admin Service
======================
Used to verify Firebase ID tokens after phone authentication
"""
import firebase_admin
from firebase_admin import credentials, auth
from typing import Optional
import os
import json

# Global Firebase app instance
_firebase_app = None

def get_firebase_app():
    """Initialize Firebase Admin SDK"""
    global _firebase_app
    
    if _firebase_app is not None:
        return _firebase_app
    
    # Get credentials from environment
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    
    if not all([project_id, private_key, client_email]):
        print("⚠️ Firebase credentials not configured - using mock auth")
        return None
    
    try:
        # Handle escaped newlines in private key
        if private_key:
            private_key = private_key.replace("\\n", "\n")
        
        cred_dict = {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        
        cred = credentials.Certificate(cred_dict)
        _firebase_app = firebase_admin.initialize_app(cred)
        print(f"✅ Firebase initialized for project: {project_id}")
        return _firebase_app
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")
        return None


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """
    Verify a Firebase ID token and return user info
    
    Args:
        id_token: The Firebase ID token from the client
        
    Returns:
        User info dict with uid, phone_number, etc. or None if invalid
    """
    app = get_firebase_app()
    if app is None:
        return None
    
    try:
        decoded_token = auth.verify_id_token(id_token)
        return {
            "uid": decoded_token.get("uid"),
            "phone_number": decoded_token.get("phone_number"),
            "email": decoded_token.get("email"),
            "name": decoded_token.get("name"),
            "firebase_uid": decoded_token.get("uid"),
        }
    except auth.InvalidIdTokenError:
        print("❌ Invalid Firebase ID token")
        return None
    except auth.ExpiredIdTokenError:
        print("❌ Expired Firebase ID token")
        return None
    except Exception as e:
        print(f"❌ Firebase token verification failed: {e}")
        return None


def get_firebase_user(uid: str) -> Optional[dict]:
    """Get Firebase user by UID"""
    app = get_firebase_app()
    if app is None:
        return None
    
    try:
        user = auth.get_user(uid)
        return {
            "uid": user.uid,
            "phone_number": user.phone_number,
            "email": user.email,
            "display_name": user.display_name,
        }
    except auth.UserNotFoundError:
        return None
    except Exception as e:
        print(f"❌ Failed to get Firebase user: {e}")
        return None
