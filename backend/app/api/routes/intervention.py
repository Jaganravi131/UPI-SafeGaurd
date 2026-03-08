"""
AI Intervention API Routes
==========================
Real-time intervention endpoints for the AI Agentic system.

Provides:
- WebSocket for real-time intervention push
- REST endpoints for intervention resolution
- Challenge verification
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import json
import asyncio

from app.services.ai_intervention_service import (
    intervention_agent,
    AgentIntervention,
    InterventionLevel
)

router = APIRouter(prefix="/intervention", tags=["AI Intervention"])


# ============== Schemas ==============

class InterventionCheckRequest(BaseModel):
    """Request to check if intervention is needed"""
    transaction_id: str
    user_id: str
    risk_score: float
    risk_factors: Dict[str, Any]
    transaction_data: Dict[str, Any]


class ChallengeResponse(BaseModel):
    """User's response to a verification challenge"""
    challenge_id: str
    answer: str


class ResolveInterventionRequest(BaseModel):
    """Request to resolve an intervention"""
    intervention_id: str
    challenge_responses: List[ChallengeResponse]
    guardian_approved: Optional[bool] = False


class InterventionOverrideRequest(BaseModel):
    """Admin override for an intervention"""
    intervention_id: str
    admin_id: str
    reason: str


# ============== WebSocket Manager ==============

class InterventionWebSocketManager:
    """Manages WebSocket connections for real-time interventions"""
    
    def __init__(self):
        # user_id -> list of active websocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        
    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                
    async def send_intervention(self, user_id: str, intervention: AgentIntervention):
        """Push intervention to all user's connected devices"""
        if user_id in self.active_connections:
            intervention_data = intervention.model_dump(mode='json')
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json({
                        "type": "intervention",
                        "data": intervention_data
                    })
                except:
                    pass  # Connection might be closed
                    
    async def send_resolution(self, user_id: str, resolution: Dict[str, Any]):
        """Push resolution result to user"""
        if user_id in self.active_connections:
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json({
                        "type": "resolution",
                        "data": resolution
                    })
                except:
                    pass


# Global WebSocket manager
ws_manager = InterventionWebSocketManager()


# ============== WebSocket Endpoint ==============

@router.websocket("/ws/{user_id}")
async def intervention_websocket(websocket: WebSocket, user_id: str):
    """
    WebSocket endpoint for real-time AI interventions
    
    Connect to receive:
    - Intervention alerts when risk exceeds threshold
    - Resolution confirmations
    - Guardian approval requests
    """
    await ws_manager.connect(websocket, user_id)
    
    try:
        while True:
            # Receive messages from client (challenge responses, etc.)
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                
            elif message.get("type") == "challenge_response":
                # Handle challenge response via WebSocket
                response = message.get("data", {})
                intervention_id = response.get("intervention_id")
                challenge_id = response.get("challenge_id")
                answer = response.get("answer")
                
                # Process would go here...
                await websocket.send_json({
                    "type": "challenge_received",
                    "intervention_id": intervention_id,
                    "challenge_id": challenge_id
                })
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
    except Exception as e:
        ws_manager.disconnect(websocket, user_id)


# ============== REST Endpoints ==============

@router.post("/check")
async def check_intervention(request: InterventionCheckRequest):
    """
    Check if AI intervention is needed for a transaction
    
    This is called by the risk assessment service after scoring.
    If intervention is needed, it will also push via WebSocket.
    """
    intervention = await intervention_agent.analyze_and_intervene(
        transaction_id=request.transaction_id,
        user_id=request.user_id,
        risk_score=request.risk_score,
        risk_factors=request.risk_factors,
        transaction_data=request.transaction_data
    )
    
    if intervention:
        # Push to user's connected devices
        await ws_manager.send_intervention(request.user_id, intervention)
        
        return {
            "intervention_required": True,
            "intervention": intervention.model_dump(mode='json')
        }
    
    return {
        "intervention_required": False,
        "message": "Transaction can proceed"
    }


@router.post("/resolve")
async def resolve_intervention(request: ResolveInterventionRequest):
    """
    Resolve an intervention with user's challenge responses
    
    Returns whether the transaction should proceed.
    """
    # Convert challenge responses to dict
    user_responses = {
        cr.challenge_id: cr.answer 
        for cr in request.challenge_responses
    }
    
    result = await intervention_agent.resolve_intervention(
        intervention_id=request.intervention_id,
        user_responses=user_responses,
        guardian_approved=request.guardian_approved or False
    )
    
    return result


@router.get("/active/{user_id}")
async def get_active_interventions(user_id: str):
    """
    Get all active interventions for a user
    
    Useful when user reconnects to check pending interventions.
    """
    active = [
        intervention.model_dump(mode='json')
        for intervention in intervention_agent.active_interventions.values()
        if intervention.user_id == user_id
    ]
    
    return {
        "count": len(active),
        "interventions": active
    }


@router.delete("/cancel/{intervention_id}")
async def cancel_intervention(intervention_id: str):
    """
    Cancel an intervention (user decided not to proceed)
    
    This removes the intervention and the transaction is cancelled.
    """
    if intervention_id in intervention_agent.active_interventions:
        intervention = intervention_agent.active_interventions[intervention_id]
        del intervention_agent.active_interventions[intervention_id]
        
        return {
            "success": True,
            "message": "Intervention cancelled, transaction aborted",
            "points_earned": 10  # Reward for making safe choice
        }
    
    return {
        "success": False,
        "error": "Intervention not found or already resolved"
    }


@router.get("/thresholds")
async def get_intervention_thresholds():
    """
    Get the current intervention threshold configuration
    
    Useful for admin dashboard to understand intervention levels.
    """
    return {
        "thresholds": {
            level.value: threshold 
            for level, threshold in intervention_agent.THRESHOLDS.items()
        },
        "levels": {
            "none": "No intervention (safe transaction)",
            "advisory": "Soft warning displayed",
            "warning": "Strong warning + verification required",
            "blocking": "Transaction blocked until verification",
            "critical": "Full block + guardian notification"
        }
    }


@router.get("/stats")
async def get_intervention_stats():
    """
    Get intervention statistics for admin dashboard
    """
    active_count = len(intervention_agent.active_interventions)
    
    # In real implementation, these would come from database
    return {
        "active_interventions": active_count,
        "today": {
            "total_interventions": 127,
            "advisory": 78,
            "warning": 34,
            "blocking": 12,
            "critical": 3
        },
        "outcomes": {
            "transactions_blocked": 45,
            "user_proceeded": 67,
            "user_cancelled": 15,
            "frauds_prevented": 12,
            "amount_saved": 425000
        }
    }
