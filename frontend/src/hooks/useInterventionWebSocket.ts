import { useEffect, useRef, useState, useCallback } from 'react'
import { AIIntervention } from '../components/AIInterventionModal'

interface UseInterventionWebSocketOptions {
  userId: string
  onIntervention: (intervention: AIIntervention) => void
  onResolution: (result: { transaction_allowed: boolean; points_earned: number }) => void
}

export function useInterventionWebSocket({
  userId,
  onIntervention,
  onResolution
}: UseInterventionWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    
    // Determine WebSocket URL based on environment
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/v1/intervention/ws/${userId}`
    
    console.log('🔌 Connecting to AI Intervention WebSocket...')
    
    try {
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        console.log('✅ AI Intervention WebSocket connected')
        setIsConnected(true)
        setConnectionAttempts(0)
      }
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          if (message.type === 'intervention') {
            console.log('🚨 Intervention received:', message.data)
            onIntervention(message.data as AIIntervention)
          } else if (message.type === 'resolution') {
            console.log('✅ Resolution received:', message.data)
            onResolution(message.data)
          } else if (message.type === 'pong') {
            // Heartbeat response
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected')
        setIsConnected(false)
        wsRef.current = null
        
        // Attempt reconnection with exponential backoff
        if (connectionAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000)
          console.log(`🔄 Reconnecting in ${delay}ms...`)
          reconnectTimeoutRef.current = setTimeout(() => {
            setConnectionAttempts(prev => prev + 1)
            connect()
          }, delay)
        }
      }
      
      wsRef.current = ws
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }, [userId, onIntervention, onResolution, connectionAttempts])
  
  // Send heartbeat to keep connection alive
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
    
    return () => clearInterval(heartbeat)
  }, [])
  
  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connect])
  
  // Send challenge response via WebSocket
  const sendChallengeResponse = useCallback((
    interventionId: string,
    challengeId: string,
    answer: string
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'challenge_response',
        data: {
          intervention_id: interventionId,
          challenge_id: challengeId,
          answer
        }
      }))
    }
  }, [])
  
  return {
    isConnected,
    sendChallengeResponse,
    reconnect: connect
  }
}

/**
 * Demo hook that simulates AI interventions for hackathon demo
 * Use this when WebSocket backend is not available
 */
export function useDemoIntervention() {
  const triggerDemoIntervention = useCallback((
    riskScore: number,
    recipientUPI: string,
    amount: number,
    hasActiveCall: boolean = false
  ): AIIntervention | null => {
    // Simulate AI agent analysis
    const level = 
      riskScore >= 0.9 ? 'critical' :
      riskScore >= 0.7 ? 'blocking' :
      riskScore >= 0.5 ? 'warning' :
      riskScore >= 0.3 ? 'advisory' : null
    
    if (!level) return null
    
    const reasons: string[] = []
    if (riskScore > 0.8) reasons.push('known_scammer')
    if (hasActiveCall) reasons.push('call_active')
    if (amount > 10000) reasons.push('high_amount')
    if (recipientUPI.includes('fake') || recipientUPI.includes('scam')) {
      reasons.push('network_fraud')
    }
    reasons.push('behavioral_anomaly')
    
    const intervention: AIIntervention = {
      intervention_id: `demo-${Date.now()}`,
      transaction_id: `txn-${Date.now()}`,
      risk_score: riskScore,
      intervention_level: level,
      reasons,
      agent_message: hasActiveCall
        ? "⚠️ I notice you're on a phone call. Making UPI payments while speaking to someone is a major fraud indicator. Scammers keep victims distracted on calls!"
        : riskScore > 0.8
        ? "🚨 STOP! This UPI ID has been reported by multiple users as a scam. Do NOT proceed!"
        : amount > 10000
        ? `💰 You're about to send ₹${amount.toLocaleString()} to a new recipient. This is above your usual transaction pattern.`
        : "📋 This transaction has some unusual patterns. Let me verify it's intentional.",
      agent_reasoning: "AI analysis based on 5-model ensemble including GNN fraud network detection and behavioral profiling.",
      confidence: Math.min(0.95, riskScore + 0.1),
      challenges: level === 'advisory' ? [
        {
          id: 'c1',
          type: 'simple_confirm',
          question: `Confirm you want to send ₹${amount.toLocaleString()} to ${recipientUPI}?`,
          options: ["Yes, I'm sure", "No, cancel this"],
          correct_answer: "Yes, I'm sure",
          timeout_seconds: 30,
          points_reward: 5
        }
      ] : level === 'warning' ? [
        {
          id: 'c1',
          type: 'risk_acknowledge',
          question: "I understand this transaction has fraud risk indicators and I choose to proceed.",
          options: ["I understand the risks", "Cancel for safety"],
          correct_answer: "I understand the risks",
          timeout_seconds: 45,
          points_reward: 10
        },
        ...(hasActiveCall ? [{
          id: 'c2',
          type: 'wait_period' as const,
          question: "Please end your phone call and wait 30 seconds. This cooling period helps prevent fraud.",
          timeout_seconds: 30,
          points_reward: 15
        }] : [])
      ] : [
        {
          id: 'c1',
          type: 'security_question',
          question: "Which of these is a sign of UPI fraud?",
          options: [
            "Someone asking for OTP over phone",
            "Paying at a registered shop",
            "Receiving money from employer",
            "Bill payment via app"
          ],
          correct_answer: "Someone asking for OTP over phone",
          timeout_seconds: 60,
          points_reward: 20
        },
        ...(level === 'critical' ? [{
          id: 'c2',
          type: 'guardian_approval' as const,
          question: "This high-risk transaction requires approval from your guardian.",
          timeout_seconds: 300,
          points_reward: 25
        }] : [])
      ],
      requires_user_action: level !== 'advisory',
      can_override: level !== 'critical',
      override_requires_guardian: level === 'blocking',
      auto_decline_after_seconds: level === 'critical' ? 60 : undefined,
      educational_tip: hasActiveCall
        ? "🎓 78% of UPI frauds involve the victim being on a phone call with the scammer. Always hang up before making any payment!"
        : riskScore > 0.8
        ? "🎓 This UPI ID has been reported by 15+ users. Verified scam patterns detected."
        : "🎓 Large first-time transactions are high risk. Consider sending a small test amount first.",
      scam_example: hasActiveCall
        ? "Recent case: A victim lost ₹3.2 lakh while on call with someone posing as a bank manager."
        : "Last month, this scam pattern caused ₹45 lakh in losses across India."
    }
    
    return intervention
  }, [])
  
  return { triggerDemoIntervention }
}
