"""
Notifications API Routes
Provides endpoints for reading user notifications (guardian alerts, risk alerts, etc.)
"""
from fastapi import APIRouter, Depends
from typing import Optional

from app.api.deps import get_current_user_id
from app.services import get_notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
async def get_notifications(
    notification_type: Optional[str] = None,
    unread_only: bool = False,
    user_id: str = Depends(get_current_user_id),
):
    """Get notifications for current user (by user_id and phone)"""
    service = get_notification_service()
    notifications = await service.get_user_notifications(
        user_id=user_id,
        notification_type=notification_type,
        unread_only=unread_only,
    )
    return {"notifications": notifications, "count": len(notifications)}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user_id: str = Depends(get_current_user_id),
):
    service = get_notification_service()
    await service.mark_as_read(user_id, notification_id)
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_read(
    user_id: str = Depends(get_current_user_id),
):
    service = get_notification_service()
    await service.mark_all_as_read(user_id)
    return {"message": "All marked as read"}
