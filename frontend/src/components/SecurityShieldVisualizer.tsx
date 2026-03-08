/**
 * Security Shield Visualization Component
 * ========================================
 * Shows the 7-layer security analysis in real-time
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Monitor,
  FileText,
  Ban,
  CheckCircle,
  Search,
  Brain,
  Users,
  Gavel,
  AlertTriangle,
  Loader2,
  XCircle,
  Lock,
  BookOpen
} from 'lucide-react'

import { securityAPI } from '../api/client'

interface LayerResult {
  name: string
  passed: boolean
  score: number
  status: 'safe' | 'warning' | 'danger'
  icon: string
}

interface SecurityAnalysis {
  transaction_id: string
  risk_level: string
  risk_level_label: string
  risk_icon: string
  final_score: number
  is_blocked: boolean
  can_proceed: boolean
  risk_color: string
  primary_reason: string
  all_reasons: string[]
  safety_tips: string[]
  scam_type_detected: string | null
  scam_type_label: string | null
  education_link: string | null
  layer_summary: LayerResult[]
}

interface EnvironmentData {
  screen_recording: boolean
  screen_sharing: boolean
  overlay_detected: boolean
  device_rooted: boolean
}

// Layer icons mapping
const LAYER_ICONS = [
  { icon: Monitor, label: 'Environment', color: 'purple' },
  { icon: FileText, label: 'Sanitization', color: 'blue' },
  { icon: Ban, label: 'Hard Rules', color: 'red' },
  { icon: Search, label: 'Verification', color: 'cyan' },
  { icon: Brain, label: 'ML Analysis', color: 'pink' },
  { icon: Users, label: 'Community', color: 'orange' },
  { icon: Gavel, label: 'Decision', color: 'green' },
]

interface SecurityShieldVisualizerProps {
  upiId: string
  amount: number
  userId?: string
  environment?: EnvironmentData
  onAnalysisComplete: (analysis: SecurityAnalysis) => void
  onError: (error: string) => void
}

export function SecurityShieldVisualizer({
  upiId,
  amount,
  userId,
  environment,
  onAnalysisComplete,
  onError
}: SecurityShieldVisualizerProps) {
  const [currentLayer, setCurrentLayer] = useState(0)
  const [layerResults, setLayerResults] = useState<LayerResult[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [analysis, setAnalysis] = useState<SecurityAnalysis | null>(null)

  useEffect(() => {
    runSecurityAnalysis()
  }, [])

  const runSecurityAnalysis = async () => {
    setIsAnalyzing(true)
    setCurrentLayer(0)
    setLayerResults([])

    // Animate through layers while API call happens
    const animationPromise = animateLayers()
    
    // Make actual API call using shared authenticated client
    try {
      const response = await securityAPI.analyze({
        upi_id: upiId,
        amount: amount,
        user_id: userId || undefined,
        environment: environment || undefined,
      })
      
      const data: SecurityAnalysis = response.data
      
      // Wait for animation to finish
      await animationPromise
      
      // Update with real results
      setLayerResults(data.layer_summary)
      setAnalysis(data)
      setIsAnalyzing(false)
      onAnalysisComplete(data)
      
    } catch (error) {
      console.error('Security analysis error:', error)
      await animationPromise
      setIsAnalyzing(false)
      onError('Security analysis failed')
    }
  }

  const animateLayers = async () => {
    for (let i = 0; i < 7; i++) {
      setCurrentLayer(i)
      await new Promise(resolve => setTimeout(resolve, 600))
      
      // Add placeholder result until real data arrives
      setLayerResults(prev => [
        ...prev,
        {
          name: LAYER_ICONS[i].label,
          passed: true,
          score: Math.random() * 30,
          status: 'safe',
          icon: '🔄'
        }
      ])
    }
    setCurrentLayer(7) // Done
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <motion.div
          animate={{ scale: isAnalyzing ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 1.5, repeat: isAnalyzing ? Infinity : 0 }}
          className="inline-block mb-4"
        >
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            {isAnalyzing ? (
              <Shield className="w-10 h-10 text-blue-600" />
            ) : analysis?.is_blocked ? (
              <ShieldOff className="w-10 h-10 text-red-600" />
            ) : analysis?.can_proceed ? (
              <ShieldCheck className="w-10 h-10 text-green-600" />
            ) : (
              <ShieldAlert className="w-10 h-10 text-orange-600" />
            )}
          </div>
        </motion.div>
        
        <h2 className="text-xl font-bold text-gray-900">
          {isAnalyzing ? '7-Layer Security Scan' : 'Security Analysis Complete'}
        </h2>
        <p className="text-gray-500 text-sm">
          {isAnalyzing ? 'Running all security checks...' : analysis?.primary_reason}
        </p>
      </div>

      {/* Layer Progress */}
      <div className="space-y-3">
        {LAYER_ICONS.map((layer, index) => {
          const Icon = layer.icon
          const result = layerResults[index]
          const isActive = currentLayer === index
          const isDone = index < currentLayer || (index < layerResults.length && !isAnalyzing)
          
          // Use real data if available
          const realResult = analysis?.layer_summary?.[index]
          const displayResult = realResult || result
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-xl border transition-all ${
                isActive 
                  ? 'bg-blue-50 border-blue-300 shadow-md' 
                  : isDone && displayResult
                    ? displayResult.status === 'safe' 
                      ? 'bg-green-50 border-green-200'
                      : displayResult.status === 'warning'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200 opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div className={`p-2 rounded-lg ${
                  isActive 
                    ? 'bg-blue-100' 
                    : isDone && displayResult
                      ? displayResult.status === 'safe'
                        ? 'bg-green-100'
                        : displayResult.status === 'warning'
                          ? 'bg-yellow-100'
                          : 'bg-red-100'
                      : 'bg-gray-100'
                }`}>
                  {isActive ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-5 h-5 text-blue-600" />
                    </motion.div>
                  ) : isDone && displayResult ? (
                    displayResult.status === 'safe' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : displayResult.status === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )
                  ) : (
                    <Icon className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${
                      isActive ? 'text-blue-700' : isDone ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      Layer {index + 1}: {layer.label}
                    </span>
                    
                    {isDone && displayResult && (
                      <span className={`text-sm font-bold ${
                        displayResult.status === 'safe' ? 'text-green-600' :
                        displayResult.status === 'warning' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {displayResult.score}% risk
                      </span>
                    )}
                  </div>
                  
                  {/* Progress bar */}
                  {isDone && displayResult && (
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${displayResult.score}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${
                          displayResult.status === 'safe' ? 'bg-green-500' :
                          displayResult.status === 'warning' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Final Score */}
      {!isAnalyzing && analysis && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`p-6 rounded-2xl text-center ${
            analysis.is_blocked 
              ? 'bg-red-600' 
              : analysis.risk_color === 'green'
                ? 'bg-green-600'
                : analysis.risk_color === 'yellow'
                  ? 'bg-yellow-500'
                  : analysis.risk_color === 'orange'
                    ? 'bg-orange-500'
                    : 'bg-red-600'
          } text-white`}
        >
          <p className="text-sm opacity-80 mb-1">Overall Risk Score</p>
          <p className="text-5xl font-bold mb-2">
            {analysis.final_score.toFixed(0)}%
          </p>
          <p className="text-lg font-medium">
            {analysis.risk_icon} {analysis.risk_level_label}
          </p>
          
          {analysis.scam_type_label && (
            <div className="mt-3 px-4 py-2 bg-white/20 rounded-lg inline-block">
              <span className="text-sm">⚠️ {analysis.scam_type_label} Detected</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

// Security Reasons Card
export function SecurityReasonsCard({ analysis }: { analysis: SecurityAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Why This Rating */}
      <div className={`card border ${
        analysis.risk_color === 'green' ? 'border-green-200 bg-green-50' :
        analysis.risk_color === 'yellow' ? 'border-yellow-200 bg-yellow-50' :
        analysis.risk_color === 'orange' ? 'border-orange-200 bg-orange-50' :
        'border-red-200 bg-red-50'
      }`}>
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${
            analysis.risk_color === 'green' ? 'text-green-600' :
            analysis.risk_color === 'yellow' ? 'text-yellow-600' :
            analysis.risk_color === 'orange' ? 'text-orange-600' :
            'text-red-600'
          }`} />
          Why This Rating
        </h3>
        <ul className="space-y-2">
          {analysis.all_reasons.slice(0, 5).map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5">•</span>
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Safety Tips */}
      <div className="card bg-blue-50 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Lock className="w-5 h-5 text-blue-600" />
          Safety Tips
        </h3>
        <ul className="space-y-2">
          {analysis.safety_tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-blue-800">
              <span className="text-blue-500 mt-0.5">→</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Learn About This Scam */}
      {analysis.scam_type_detected && analysis.education_link && (
        <a
          href={analysis.education_link}
          className="card bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors block"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-purple-600" />
            <div>
              <h3 className="font-semibold text-purple-900">
                Learn About {analysis.scam_type_label || 'This Scam'}
              </h3>
              <p className="text-sm text-purple-700">
                Understand how this scam works and how to protect yourself
              </p>
            </div>
          </div>
        </a>
      )}
    </div>
  )
}

export default SecurityShieldVisualizer
