import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Brain,
  X,
  XCircle,
  Clock,
  AlertCircle,
  Lightbulb,
  ChevronRight,
  Lock,
  Users
} from 'lucide-react'

export interface InterventionChallenge {
  id: string
  type: string
  question: string
  options?: string[]
  correct_answer?: string
  timeout_seconds: number
  points_reward: number
}

export interface AIIntervention {
  intervention_id: string
  transaction_id: string
  risk_score: number
  intervention_level: 'advisory' | 'warning' | 'blocking' | 'critical'
  reasons: string[]
  agent_message: string
  agent_reasoning: string
  confidence: number
  challenges: InterventionChallenge[]
  requires_user_action: boolean
  can_override: boolean
  override_requires_guardian: boolean
  auto_decline_after_seconds?: number
  educational_tip?: string
  scam_example?: string
}

interface Props {
  intervention: AIIntervention
  recipientUPI: string
  amount: number
  onProceed: (responses: Record<string, string>) => void
  onCancel: () => void
  onClose: () => void
}

export default function AIInterventionModal({
  intervention,
  recipientUPI,
  amount,
  onProceed,
  onCancel,
  onClose
}: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [challengeResponses, setChallengeResponses] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(intervention.auto_decline_after_seconds || 0)
  const [waitingTime, setWaitingTime] = useState(0)
  const [showEducation, setShowEducation] = useState(false)

  // Colors based on intervention level
  const levelConfig = {
    advisory: {
      bgGradient: 'from-yellow-600/20 to-orange-600/20',
      borderColor: 'border-yellow-500/50',
      iconBg: 'bg-yellow-500',
      textColor: 'text-yellow-400',
      title: 'Security Advisory'
    },
    warning: {
      bgGradient: 'from-orange-600/20 to-red-600/20',
      borderColor: 'border-orange-500/50',
      iconBg: 'bg-orange-500',
      textColor: 'text-orange-400',
      title: 'Risk Warning'
    },
    blocking: {
      bgGradient: 'from-red-600/20 to-red-800/20',
      borderColor: 'border-red-500/50',
      iconBg: 'bg-red-500',
      textColor: 'text-red-400',
      title: 'Transaction Blocked'
    },
    critical: {
      bgGradient: 'from-red-700/30 to-red-900/30',
      borderColor: 'border-red-600',
      iconBg: 'bg-red-600',
      textColor: 'text-red-500',
      title: '🚨 CRITICAL ALERT'
    }
  }

  const config = levelConfig[intervention.intervention_level]

  // Auto-decline timer for critical interventions
  useEffect(() => {
    if (intervention.auto_decline_after_seconds && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            onCancel()
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [intervention.auto_decline_after_seconds, timeLeft, onCancel])

  // Wait period timer for challenges
  const currentChallenge = intervention.challenges[currentStep]
  useEffect(() => {
    if (currentChallenge?.type === 'wait_period') {
      setWaitingTime(currentChallenge.timeout_seconds)
      const timer = setInterval(() => {
        setWaitingTime(t => {
          if (t <= 1) {
            handleChallengeResponse(currentChallenge.id, 'completed')
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [currentStep, currentChallenge])

  // Play alert sound on mount
  useEffect(() => {
    if (intervention.intervention_level === 'critical' || intervention.intervention_level === 'blocking') {
      // Would play alert sound
    }
  }, [])

  const handleChallengeResponse = (challengeId: string, answer: string) => {
    setChallengeResponses(prev => ({ ...prev, [challengeId]: answer }))
    
    // Move to next step or complete
    if (currentStep < intervention.challenges.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleProceed = () => {
    // Check if all challenges are answered
    const allAnswered = intervention.challenges.every(
      c => challengeResponses[c.id] !== undefined
    )
    
    if (allAnswered || !intervention.requires_user_action) {
      onProceed(challengeResponses)
    }
  }

  const getRiskReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      known_scammer: '⚠️ Known scammer UPI ID',
      call_active: '📱 Phone call detected',
      stress_detected: '😰 Stress indicators detected',
      network_fraud: '🕸️ Fraud network connection',
      behavioral_anomaly: '📊 Unusual behavior pattern',
      new_recipient: '👤 First-time recipient',
      high_amount: '💰 High value transaction',
      unusual_time: '🕐 Unusual transaction time',
      velocity_breach: '⚡ Rapid successive transactions',
      pattern_match: '🔍 Known fraud pattern match'
    }
    return reasons[reason] || reason
  }

  const allChallengesCompleted = intervention.challenges.every(
    c => challengeResponses[c.id] !== undefined
  )

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className={`w-full max-w-lg bg-gradient-to-br ${config.bgGradient} backdrop-blur-xl rounded-2xl border ${config.borderColor} shadow-2xl overflow-hidden`}
        >
          {/* Header */}
          <div className={`p-4 ${config.iconBg} bg-opacity-20 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 ${config.iconBg} rounded-lg`}>
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{config.title}</h3>
                <p className="text-sm text-gray-300 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  AI SafeGuard Intervention
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${config.textColor} bg-black/30`}>
                Risk: {(intervention.risk_score * 100).toFixed(0)}%
              </span>
              {intervention.intervention_level !== 'critical' && (
                <button
                  onClick={onClose}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Auto-decline timer for critical */}
          {timeLeft > 0 && (
            <div className="px-4 py-2 bg-red-600/30 border-b border-red-500/30">
              <div className="flex items-center justify-between">
                <span className="text-red-300 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Auto-declining in
                </span>
                <span className="text-red-400 font-bold">{timeLeft}s</span>
              </div>
              <div className="mt-1 h-1 bg-red-900/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: timeLeft, ease: 'linear' }}
                  className="h-full bg-red-500"
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* AI Agent Message */}
            <div className="space-y-3">
              <div className={`p-4 bg-black/30 rounded-xl border ${config.borderColor}`}>
                <p className="text-white text-lg leading-relaxed">
                  {intervention.agent_message}
                </p>
              </div>
              
              {/* Transaction Info */}
              <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Recipient</p>
                  <p className="text-white font-mono">{recipientUPI}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Amount</p>
                  <p className="text-white font-bold text-xl">₹{amount.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Risk Reasons */}
            <div>
              <p className="text-gray-400 text-sm mb-2">Risk Factors Detected:</p>
              <div className="flex flex-wrap gap-2">
                {intervention.reasons.map((reason, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-xs ${config.bgGradient} ${config.textColor} border ${config.borderColor}`}
                  >
                    {getRiskReasonText(reason)}
                  </span>
                ))}
              </div>
            </div>

            {/* Verification Challenges */}
            {intervention.challenges.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold">Verification Required</p>
                  <span className="text-gray-400 text-sm">
                    Step {currentStep + 1} of {intervention.challenges.length}
                  </span>
                </div>
                
                {currentChallenge && (
                  <motion.div
                    key={currentChallenge.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 bg-black/30 rounded-xl border border-white/10"
                  >
                    {currentChallenge.type === 'wait_period' ? (
                      <div className="text-center py-4">
                        <Clock className={`w-12 h-12 ${config.textColor} mx-auto mb-3`} />
                        <p className="text-white mb-2">{currentChallenge.question}</p>
                        <p className={`text-4xl font-bold ${config.textColor}`}>{waitingTime}s</p>
                        <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: '100%' }}
                            animate={{ width: '0%' }}
                            transition={{ duration: currentChallenge.timeout_seconds, ease: 'linear' }}
                            className={`h-full ${config.iconBg}`}
                          />
                        </div>
                      </div>
                    ) : currentChallenge.type === 'guardian_approval' ? (
                      <div className="text-center py-4">
                        <Users className={`w-12 h-12 ${config.textColor} mx-auto mb-3`} />
                        <p className="text-white mb-2">{currentChallenge.question}</p>
                        <p className="text-gray-400 text-sm">Waiting for guardian response...</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-white mb-4">{currentChallenge.question}</p>
                        {currentChallenge.options && (
                          <div className="space-y-2">
                            {currentChallenge.options.map((option, i) => (
                              <button
                                key={i}
                                onClick={() => handleChallengeResponse(currentChallenge.id, option)}
                                disabled={challengeResponses[currentChallenge.id] !== undefined}
                                className={`w-full p-3 rounded-lg text-left transition-all ${
                                  challengeResponses[currentChallenge.id] === option
                                    ? 'bg-primary-500/30 border-primary-500 text-primary-400'
                                    : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                                } ${challengeResponses[currentChallenge.id] !== undefined ? 'cursor-not-allowed' : ''}`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Points reward */}
                    <p className="mt-3 text-center text-sm text-gray-400">
                      +{currentChallenge.points_reward} security points on completion
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            {/* Educational Content */}
            {(intervention.educational_tip || intervention.scam_example) && (
              <div>
                <button
                  onClick={() => setShowEducation(!showEducation)}
                  className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  <Lightbulb className="w-4 h-4" />
                  {showEducation ? 'Hide' : 'Show'} fraud awareness tip
                  <ChevronRight className={`w-4 h-4 transition-transform ${showEducation ? 'rotate-90' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {showEducation && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                        {intervention.educational_tip && (
                          <p className="text-cyan-300 text-sm mb-2">{intervention.educational_tip}</p>
                        )}
                        {intervention.scam_example && (
                          <p className="text-gray-400 text-xs italic">{intervention.scam_example}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-white/10 bg-black/20">
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Cancel & Stay Safe
              </button>
              
              {intervention.can_override && (
                <button
                  onClick={handleProceed}
                  disabled={intervention.requires_user_action && !allChallengesCompleted}
                  className={`flex-1 py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    intervention.requires_user_action && !allChallengesCompleted
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : `${config.iconBg} hover:opacity-90 text-white`
                  }`}
                >
                  {intervention.override_requires_guardian ? (
                    <>
                      <Lock className="w-5 h-5" />
                      Needs Guardian
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Proceed Anyway
                    </>
                  )}
                </button>
              )}
            </div>
            
            {intervention.intervention_level === 'critical' && (
              <p className="mt-3 text-center text-red-400 text-sm">
                ⚠️ This transaction cannot proceed without guardian approval
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
