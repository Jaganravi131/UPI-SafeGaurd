"""
Shared API dependencies
Provides reusable FastAPI dependencies for authentication, etc.
"""
from fastapi import Header, Depends, HTTPException, status
from typing import Optional
from jose import jwt, JWTError

from app.config import settings


async def get_current_user_id(
    authorization: Optional[str] = Header(None)
) -> str:
    """
    Extract user_id from JWT Bearer token.
    Raises 401 if no valid token is provided.

    Usage in routes:
        @router.get("/something")
        async def something(user_id: str = Depends(get_current_user_id)):
            ...
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Strip "Bearer " prefix
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id:
            return user_id
    except JWTError:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_user_id(
    authorization: Optional[str] = Header(None)
) -> Optional[str]:
    """
    Like get_current_user_id but returns None instead of raising 401
    when no valid token is provided. Useful for endpoints that work
    for both authenticated and unauthenticated users.
    """
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        return user_id
    except JWTError:
        return None
