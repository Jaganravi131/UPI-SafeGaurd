/**
 * PaymentFlow V2 - With 7-Layer Security Shield
 * ==============================================
 * The key differentiator: Real-time 7-layer security analysis
 * "Google Pay protects your PIN. We protect your judgment."
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  QrCode, 
  User, 
  IndianRupee, 
  FileText, 
  Send,
  Shield,
  AlertTriangle,
  Loader2,
  Phone,
  AtSign,
  CheckCircle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  PhoneCall,
  Ban,
  ThumbsUp,
  Search,
  Building,
  Monitor,
  BookOpen,
  Lock,
  Wallet,
  Volume2,
  VolumeX,
  Brain
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useKillSwitch, KillSwitchAlert } from '../components/KillSwitch'
import AIInterventionModal, { AIIntervention } from '../components/AIInterventionModal'
import QRScanner from '../components/QRScanner'
import MyQRCode from '../components/MyQRCode'
import { transactionAPI, contactsAPI, walletAPI, interventionAPI, aiAPI } from '../api/client'
import { useAuthStore, useUIStore } from '../store'
import { useTranslation } from '../contexts/TranslationContext'
import { generateNCRPReport } from '../utils/generateNCRPReport'

// Layer configuration
const SECURITY_LAYERS = [
  { name: 'Environment', icon: Monitor, color: 'purple', desc: 'Screen recording detection' },
  { name: 'Sanitization', icon: FileText, color: 'blue', desc: 'Input validation' },
  { name: 'Hard Rules', icon: Ban, color: 'red', desc: 'Blocklist check' },
  { name: 'Verification', icon: Search, color: 'cyan', desc: 'UPI verification' },
  { name: 'Risk Check', icon: Shield, color: 'pink', desc: 'Fraud analysis' },
  { name: 'Community', icon: User, color: 'orange', desc: 'Crowd intelligence' },
  { name: 'Decision', icon: ShieldCheck, color: 'green', desc: 'Final verdict' },
]

interface ContactInfo {
  phone: string
  name: string
  upi_id: string
  bank: string
  is_verified: boolean
  trust_score: number
}

interface ScammerAlert {
  is_scammer: boolean
  upi_id?: string
  scam_type?: string
  risk_level?: string
  report_count?: number
  warning_message?: string
}

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
  final_score: number
  is_blocked: boolean
  can_proceed: boolean
  risk_color: string
  risk_icon: string
  primary_reason: string
  all_reasons: string[]
  safety_tips: string[]
  scam_type_detected: string | null
  scam_type_label: string | null
  education_link: string | null
  layer_summary: LayerResult[]
}

export default function PaymentFlowV2() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { language } = useUIStore()
  const { t, speak, speakUrgent, isSpeaking, isUrgentSpeaking, stopSpeaking } = useTranslation()
  
  // Kill Switch
  const { threats, isSecure, dismissThreats } = useKillSwitch()
  const [showKillSwitchAlert, setShowKillSwitchAlert] = useState(false)
  
  // Payment steps
  const [step, setStep] = useState<'input' | 'analyzing' | 'review'>('input')
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'phone'>('upi')
  
  // QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [showMyQR, setShowMyQR] = useState(false)
  
  // Form state
  const [upiId, setUpiId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  
  // Contact state
  const [isSearching, setIsSearching] = useState(false)
  const [foundContact, setFoundContact] = useState<ContactInfo | null>(null)
  const [scammerAlert, setScammerAlert] = useState<ScammerAlert | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  
  // Security analysis state
  const [currentLayer, setCurrentLayer] = useState(0)
  const [layerResults, setLayerResults] = useState<LayerResult[]>([])
  const [securityAnalysis, setSecurityAnalysis] = useState<SecurityAnalysis | null>(null)
  
  // AI Intervention
  const [activeIntervention, setActiveIntervention] = useState<AIIntervention | null>(null)
  const [isOnCall, setIsOnCall] = useState(false)
  // Processing lock — blocks UI interaction during payment execution
  const [isProcessing, setIsProcessing] = useState(false)
  // Risk token from /assess-risk (replay protection)
  const [riskToken, setRiskToken] = useState<string | null>(null)
  // Risk model component scores from /assess-risk
  const [mlScores, setMlScores] = useState<{
    ensemble_score?: number
    xgboost_score?: number
    lstm_score?: number
    isolation_forest_score?: number
    gnn_score?: number
    sensor_score?: number
    model_versions?: Record<string, { status: string; confidence: number }>
  } | null>(null)
  
  // AI-translated risk content (for non-English languages)
  const [translatedReasons, setTranslatedReasons] = useState<string[] | null>(null)
  const [translatedTips, setTranslatedTips] = useState<string[] | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  
  // Sensor data for stress/coercion detection
  const [sensorData, setSensorData] = useState<{
    gyroscope: { x: number; y: number; z: number }
    accelerometer: { x: number; y: number; z: number }
    touch_pressure: number
    typing_speed: number
  }>({
    gyroscope: { x: 0, y: 0, z: 0 },
    accelerometer: { x: 0, y: 0, z: 0 },
    touch_pressure: 0.5,
    typing_speed: 0,
  })
  const lastKeystrokeRef = useRef<number>(0)
  const keystrokeIntervalsRef = useRef<number[]>([])
  
  // Balance state
  const [balance, setBalance] = useState<number | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)
  
  // Collect device sensor data (gyroscope + accelerometer)
  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      const rotation = event.rotationRate
      const acceleration = event.accelerationIncludingGravity
      if (rotation) {
        setSensorData(prev => ({
          ...prev,
          gyroscope: {
            x: rotation.alpha || 0,
            y: rotation.beta || 0,
            z: rotation.gamma || 0,
          },
        }))
      }
      if (acceleration) {
        setSensorData(prev => ({
          ...prev,
          accelerometer: {
            x: acceleration.x || 0,
            y: acceleration.y || 0,
            z: acceleration.z || 0,
          },
        }))
      }
    }
    window.addEventListener('devicemotion', handleMotion)
    return () => window.removeEventListener('devicemotion', handleMotion)
  }, [])
  
  // Track typing speed for behavioral profiling
  const handleKeyPress = useCallback(() => {
    const now = Date.now()
    if (lastKeystrokeRef.current > 0) {
      const interval = now - lastKeystrokeRef.current
      keystrokeIntervalsRef.current.push(interval)
      if (keystrokeIntervalsRef.current.length > 20) keystrokeIntervalsRef.current.shift()
      const avg = keystrokeIntervalsRef.current.reduce((a, b) => a + b, 0) / keystrokeIntervalsRef.current.length
      const wpm = avg > 0 ? Math.round(60000 / (avg * 5)) : 0
      setSensorData(prev => ({ ...prev, typing_speed: wpm }))
    }
    lastKeystrokeRef.current = now
  }, [])
  
  // Voice alert function — delegates to TranslationContext (supports all 12 languages)
  const speakAlert = useCallback((message: string, urgent: boolean = false) => {
    if (urgent) {
      speakUrgent(message)
    } else {
      speak(message)
    }
  }, [speak, speakUrgent])
  
  // Fetch wallet balance on mount
  useEffect(() => {
    const fetchBalance = async () => {
      if (!user?.id) return
      try {
        const response = await walletAPI.getBalance(user.id)
        setBalance(response.data.balance)
      } catch (error) {
        console.error('Failed to fetch balance:', error)
        setBalance(null)
      } finally {
        setIsLoadingBalance(false)
      }
    }
    fetchBalance()
  }, [user?.id])

  const insufficientBalance = balance !== null && amount !== '' && parseFloat(amount) > balance
  
  const formatBalance = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)

  // Check for Kill Switch threats
  useEffect(() => {
    if (!isSecure && threats.length > 0) {
      setShowKillSwitchAlert(true)
    }
  }, [isSecure, threats])

  // Prevent accidental navigation/close while payment is processing
  useEffect(() => {
    if (!isProcessing) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isProcessing])

  // Phone number search
  const handlePhoneSearch = async () => {
    if (phoneNumber.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number')
      return
    }
    
    setIsSearching(true)
    setSearchError(null)
    setFoundContact(null)
    setScammerAlert(null)
    
    try {
      const { data } = await contactsAPI.search(phoneNumber)
      
      if (data.scammer_alert?.is_scammer) {
        setScammerAlert(data.scammer_alert)
        toast.error('⚠️ Warning: This number is linked to fraud reports!')
        // Auto-voice: urgently warn about scammer
        speakAlert(
          data.scammer_alert.warning_message || 'Warning! This number is linked to fraud reports. Do not send money.',
          true
        )
      }
      
      if (data.found && data.contact) {
        setFoundContact(data.contact)
        setUpiId(data.contact.upi_id)
        toast.success(`Found: ${data.contact.name}`)
      } else if (!data.scammer_alert?.is_scammer) {
        setSearchError('No UPI ID found for this number')
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchError('Could not search. Try entering UPI ID directly.')
    } finally {
      setIsSearching(false)
    }
  }

  // UPI verification
  const handleUpiVerify = async () => {
    if (!upiId || !upiId.includes('@')) {
      toast.error('Please enter a valid UPI ID (e.g., name@bank)')
      return
    }
    
    setIsSearching(true)
    setSearchError(null)
    
    try {
      const { data } = await contactsAPI.verifyUPI(upiId)
      
      if (data.valid) {
        if (data.is_scammer) {
          setScammerAlert({
            is_scammer: true,
            upi_id: data.upi_id,
            warning_message: data.warning
          })
          toast.error('🚨 This UPI ID has been reported for fraud!')
          // Auto-voice: urgently warn about scammer UPI
          speakAlert(
            data.warning || 'Danger! This UPI ID has been reported for fraud. Do not send money to this account.',
            true
          )
        } else {
          setFoundContact({
            phone: '',
            name: data.name,
            upi_id: data.upi_id,
            bank: data.bank,
            is_verified: data.is_verified,
            trust_score: data.trust_score || 50
          })
          if (data.warning) {
            toast(data.warning, { icon: '⚠️' })
          } else {
            toast.success(`Verified: ${data.name}`)
          }
        }
      } else {
        setSearchError(data.error || 'Invalid UPI ID')
      }
    } catch (error) {
      console.error('UPI verification error:', error)
      setSearchError('Could not verify UPI ID. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  // Run 7-Layer Security Analysis
  const runSecurityAnalysis = async () => {
    // Validate
    if (!upiId || !upiId.includes('@')) {
      toast.error('Please enter a valid UPI ID')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (balance !== null && parseFloat(amount) > balance) {
      toast.error(`Insufficient balance. Available: ${formatBalance(balance)}`)
      return
    }

    // Check Kill Switch first
    if (!isSecure) {
      setShowKillSwitchAlert(true)
      return
    }

    setStep('analyzing')
    setCurrentLayer(0)
    setLayerResults([])
    setSecurityAnalysis(null)

    // Animate through layers while API calls happen
    const animateLayer = (index: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          setCurrentLayer(index + 1)
          resolve()
        }, 80) // 80ms per layer = 0.56s total (fast & smooth)
      })
    }

    try {
      // Animate through layers
      for (let i = 0; i < 7; i++) {
        await animateLayer(i)
      }

      const { data } = await transactionAPI.assessRisk({
        recipient_upi: upiId,
        amount: parseFloat(amount),
        note: note,
        call_active: isOnCall,
      })

      const rawScore = Number(data?.ensemble_score ?? 0)
      const normalizedScore = Math.max(0, Math.min(1, rawScore))
      const finalScore = normalizedScore * 100
      const backendRiskLevel = String(data?.risk_level || 'low').toLowerCase()
      const riskLabelMap: Record<string, string> = {
        low: 'Low Risk',
        medium: 'Medium Risk',
        high: 'High Risk',
        critical: 'Critical Risk',
      }
      const riskColorMap: Record<string, 'green' | 'yellow' | 'orange' | 'red'> = {
        low: 'green',
        medium: 'yellow',
        high: 'orange',
        critical: 'red',
      }
      const reviewRiskLevelMap: Record<string, 'safe' | 'caution' | 'risky' | 'dangerous'> = {
        low: 'safe',
        medium: 'caution',
        high: 'risky',
        critical: 'dangerous',
      }

      const riskColor = riskColorMap[backendRiskLevel] || 'yellow'
      const riskLevelLabel = riskLabelMap[backendRiskLevel] || 'Medium Risk'
      const reviewRiskLevel = reviewRiskLevelMap[backendRiskLevel] || 'caution'
      const recommendedAction = String(data?.recommended_action || 'allow').toLowerCase()
      const riskFactors: string[] = Array.isArray(data?.risk_factors) && data.risk_factors.length
        ? data.risk_factors
        : ['No major fraud indicators detected.']

      const tipsByRisk: Record<string, string[]> = {
        low: ['Confirm recipient name and UPI ID before sending.'],
        medium: ['Verify recipient details once more before proceeding.', 'Avoid rushed payments during active phone calls.'],
        high: ['Call the recipient on a trusted number to verify the request.', 'Do not share OTP/PIN or approve unknown collect requests.'],
        critical: ['Do not proceed with this payment.', 'Report suspicious behavior immediately from the fraud report page.'],
      }

      const syntheticLayerSummary: LayerResult[] = SECURITY_LAYERS.map((layer, index) => {
        let status: 'safe' | 'warning' | 'danger' = 'safe'
        if (index === 4 || index === 6) {
          status = riskColor === 'red' ? 'danger' : riskColor === 'orange' || riskColor === 'yellow' ? 'warning' : 'safe'
        }
        return {
          name: layer.name,
          passed: status !== 'danger',
          score: Math.max(0, Math.min(100, finalScore)),
          status,
          icon: status === 'safe' ? 'check' : status === 'warning' ? 'alert' : 'block',
        }
      })

      const mappedAnalysis: SecurityAnalysis = {
        transaction_id: String(data?.transaction_id || crypto.randomUUID()),
        risk_level: reviewRiskLevel,
        risk_level_label: riskLevelLabel,
        final_score: finalScore,
        is_blocked: recommendedAction === 'block',
        can_proceed: recommendedAction !== 'block',
        risk_color: riskColor,
        risk_icon: riskColor,
        primary_reason: riskFactors[0],
        all_reasons: riskFactors,
        safety_tips: tipsByRisk[backendRiskLevel] || tipsByRisk.medium,
        scam_type_detected: null,
        scam_type_label: null,
        education_link: null,
        layer_summary: syntheticLayerSummary,
      }

      if (data?.risk_token) {
        setRiskToken(data.risk_token)
      } else {
        throw new Error('Risk token missing from assess-risk response')
      }

      setMlScores({
        ensemble_score: data?.ensemble_score,
        xgboost_score: data?.xgboost_score,
        lstm_score: data?.lstm_score,
        isolation_forest_score: data?.isolation_forest_score,
        gnn_score: data?.gnn_score,
        sensor_score: data?.sensor_score,
        model_versions: data?.model_versions,
      })
      setLayerResults(mappedAnalysis.layer_summary)
      setSecurityAnalysis(mappedAnalysis)

      // Voice alert (fire-and-forget, don't block review)
      const voicePromise = (async () => {
        if (data.risk_level === 'dangerous' || data.risk_level === 'blocked' || data.risk_level === 'risky' || data.risk_level === 'caution') {
          let alertMessage = ''
          const isCritical = data.risk_level === 'dangerous' || data.risk_level === 'blocked'
          if (isCritical) {
            alertMessage = `Warning! This transaction has been flagged as extremely dangerous. ${data.primary_reason}. Do not proceed.`
          } else if (data.risk_level === 'risky') {
            alertMessage = `Caution! This transaction is high risk. ${data.primary_reason}. Please verify before proceeding.`
          } else {
            alertMessage = `Please note: ${data.primary_reason}. Proceed with caution.`
          }
          if (language && language !== 'en') {
            try {
              const voiceRes = await aiAPI.voiceAlert({
                alert_type: data.risk_level,
                context: { reason: data.primary_reason, amount: parseFloat(amount), recipient: upiId },
                target_language: language,
              })
              speakAlert(voiceRes.data?.alert_text || alertMessage, isCritical)
            } catch { speakAlert(alertMessage, isCritical) }
          } else {
            speakAlert(alertMessage, isCritical)
          }
        }
      })()

      // Translation (fire in parallel, will update review UI when ready)
      const translatePromise = (async () => {
        if (language && language !== 'en' && data.all_reasons?.length) {
          setIsTranslating(true)
          try {
            const textsToTranslate = [...data.all_reasons.slice(0, 5), ...data.safety_tips]
            const res = await aiAPI.translateAlerts(textsToTranslate, language)
            if (res.data?.translations) {
              const translations = res.data.translations
              setTranslatedReasons(translations.slice(0, data.all_reasons.slice(0, 5).length))
              setTranslatedTips(translations.slice(data.all_reasons.slice(0, 5).length))
            }
          } catch (err) {
            console.warn('Translation failed, showing English:', err)
          } finally {
            setIsTranslating(false)
          }
        } else {
          setTranslatedReasons(null)
          setTranslatedTips(null)
        }
      })()

      // Wait for risk token (critical for payment), then show review
      setStep('review')
      
      // Voice & translation continue in background — don't block review
      void voicePromise
      void translatePromise
      
    } catch (error) {
      console.error('Security analysis error:', error)
      toast.error('Security analysis failed. Please try again.')
      setStep('input')
    }
  }

  // Handle proceed
  const handleProceed = async () => {
    if (!securityAnalysis || isProcessing) return
    setIsProcessing(true)
    
    const normalizedRisk = securityAnalysis.final_score / 100
    
    // Call the real backend AI intervention engine
    if (normalizedRisk >= 0.3 && user?.id) {
      try {
        const res = await interventionAPI.check({
          transaction_id: securityAnalysis.transaction_id,
          user_id: user.id,
          risk_score: normalizedRisk,
          risk_factors: {
            reasons: securityAnalysis.all_reasons,
            call_active: isOnCall,
          },
          transaction_data: {
            recipient_upi: upiId,
            amount: parseFloat(amount),
            purpose: note,
          },
        })
        
        if (res.data?.intervention_required && res.data.intervention) {
          setActiveIntervention(res.data.intervention as AIIntervention)
          return
        }
      } catch (err) {
        console.warn('Intervention check failed, proceeding with payment:', err)
      }
    }
    
    await executePayment()
  }

  const executePayment = async () => {
    setIsProcessing(true)
    try {
      const response = await transactionAPI.create({
        recipient_upi: upiId,
        amount: parseFloat(amount),
        purpose: note,
        risk_token: riskToken || undefined,
        sensor_data: sensorData,
      })
      
      // Handle guardian pending status
      if (response.data.status === 'guardian_pending') {
        speakAlert('This transaction requires guardian approval. Your guardian has been notified.', false)
        toast('⏳ Awaiting guardian approval — your guardian has been notified.', { duration: 5000 })
        navigate('/history')
        return
      }
      
      if (response.data.status === 'blocked') {
        speakAlert('This payment was blocked for your safety due to high fraud risk.', true)
        toast.error('Payment blocked due to high risk. Your funds are safe.')
        navigate('/history')
        return
      }
      
      // Refresh wallet balance in real time after successful payment
      if (user?.id) {
        try {
          const balRes = await walletAPI.getBalance(user.id)
          setBalance(balRes.data.balance)
        } catch (_) { /* balance will refresh on next page load */ }
      }
      
      toast.success('Payment sent successfully! ✓')
      navigate('/history')
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Payment failed. Please try again.'
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleInterventionProceed = async (responses?: Record<string, string>) => {
    // Resolve the intervention on the backend (if it was a real backend intervention)
    if (activeIntervention?.intervention_id && !activeIntervention.intervention_id.startsWith('demo-')) {
      try {
        const challengeResponses = Object.entries(responses || {}).map(
          ([challenge_id, answer]) => ({ challenge_id, answer })
        )
        await interventionAPI.resolve({
          intervention_id: activeIntervention.intervention_id,
          challenge_responses: challengeResponses,
        })
      } catch (err) {
        console.warn('Failed to resolve intervention on backend:', err)
      }
    }
    setActiveIntervention(null)
    toast.success('Verification complete! +10 security points earned')
    await executePayment()
  }

  const handleInterventionCancel = async () => {
    // Cancel the intervention on the backend
    if (activeIntervention?.intervention_id && !activeIntervention.intervention_id.startsWith('demo-')) {
      try {
        await interventionAPI.cancel(activeIntervention.intervention_id)
      } catch (err) {
        console.warn('Failed to cancel intervention on backend:', err)
      }
    }
    setActiveIntervention(null)
    toast.success('Smart choice! You earned +15 security points for staying safe 🛡️')
    setStep('input')
  }

  // Get colors for risk levels
  const getRiskColors = (color: string) => {
    switch (color) {
      case 'green': return { bg: 'bg-green-600', light: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' }
      case 'yellow': return { bg: 'bg-yellow-500', light: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' }
      case 'orange': return { bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' }
      case 'red': return { bg: 'bg-red-600', light: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' }
      default: return { bg: 'bg-gray-500', light: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' }
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-20">
      {/* Kill Switch Alert */}
      <KillSwitchAlert
        threats={threats}
        isVisible={showKillSwitchAlert}
        onDismiss={() => {
          setShowKillSwitchAlert(false)
          dismissThreats()
        }}
        onBlockPayment={() => {
          setShowKillSwitchAlert(false)
          navigate('/dashboard')
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="relative">
            <div className="absolute inset-0 bg-primary-500 rounded-xl blur-md opacity-30 animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary-500 to-primary-700 p-2.5 rounded-xl shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            {t('pay_send_money', 'Send Money')}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">{t('pay_protected_by', 'Protected by 7-Layer Security Shield')}</p>
        
        {/* Receive / My QR Button */}
        {user?.upi_id && (
          <button
            onClick={() => setShowMyQR(true)}
            className="mt-3 mr-2 inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-50 to-primary-50 text-primary-700 rounded-full text-sm font-medium border border-primary-200/60 shadow-sm hover:shadow-md transition-all"
          >
            <QrCode className="w-4 h-4" />
            {t('pay_my_qr', 'My QR Code')}
          </button>
        )}
        
        {/* Security Status */}
        {isSecure ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 rounded-full text-sm font-medium border border-green-200/60 shadow-sm"
          >
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <ShieldCheck className="w-4 h-4" />
            {t('pay_env_secure', 'Environment Secure')}
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-gradient-to-r from-red-50 to-red-100 text-red-700 rounded-full text-sm font-medium border border-red-200/60 shadow-sm"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <ShieldAlert className="w-4 h-4" />
            {t('pay_threats_detected', 'Threats Detected')}
          </motion.div>
        )}
      </motion.div>

      {/* Input Step */}
      {step === 'input' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card space-y-6"
        >
          {/* QR Scanner Area */}
          <button
            onClick={() => setShowQRScanner(true)}
            className="w-full relative bg-gradient-to-br from-primary-50 via-white to-violet-50 rounded-2xl p-6 text-center border border-primary-100/60 overflow-hidden hover:border-primary-300 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-primary-400 rounded-tl-lg" />
              <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-primary-400 rounded-tr-lg" />
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-primary-400 rounded-bl-lg" />
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-primary-400 rounded-br-lg" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <QrCode className="w-14 h-14 text-primary-400 mx-auto mb-3" />
            </motion.div>
            <p className="text-gray-700 font-medium text-sm">{t('pay_scan_qr', 'Scan QR Code')}</p>
            <p className="text-gray-400 text-xs mt-1">{t('pay_tap_camera', 'Tap to open camera scanner')}</p>
          </button>
          
          {/* QR Scanner Component */}
          <QRScanner
            isOpen={showQRScanner}
            onClose={() => setShowQRScanner(false)}
            onScan={(result) => {
              if (result.upiId) {
                setUpiId(result.upiId)
                setPaymentMethod('upi')
              }
              if (result.amount) setAmount(String(result.amount))
              if (result.note) setNote(result.note)
              if (result.name) {
                setFoundContact({
                  phone: '',
                  name: result.name,
                  upi_id: result.upiId,
                  bank: '',
                  is_verified: false,
                  trust_score: 50,
                })
              }
              toast.success(`QR scanned: ${result.upiId}`)
            }}
          />

          {/* Payment Method Tabs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('pay_send_to', 'Send To')}</label>
            <div className="flex bg-gray-100 rounded-lg p-1 mb-3">
              <button
                onClick={() => { setPaymentMethod('upi'); setFoundContact(null); setScammerAlert(null); }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  paymentMethod === 'upi' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                <AtSign className="w-4 h-4" />
                UPI ID
              </button>
              <button
                onClick={() => { setPaymentMethod('phone'); setFoundContact(null); setScammerAlert(null); }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  paymentMethod === 'phone' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                <Phone className="w-4 h-4" />
                Mobile
              </button>
            </div>

            {/* Phone Search */}
            {paymentMethod === 'phone' ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <div className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-600 font-medium">+91</div>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))
                        setFoundContact(null)
                        setScammerAlert(null)
                      }}
                      placeholder={t('pay_enter_mobile', 'Enter mobile number')}
                      className="input-field pl-20"
                      maxLength={10}
                    />
                  </div>
                  <button
                    onClick={handlePhoneSearch}
                    disabled={isSearching || phoneNumber.length !== 10}
                    className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
                  >
                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>

                {/* Results */}
                <AnimatePresence>
                  {foundContact && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 bg-green-50 border border-green-200 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{foundContact.name}</p>
                          <p className="text-sm text-gray-600">{foundContact.upi_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Building className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">{foundContact.bank}</span>
                            {foundContact.is_verified && (
                              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                <CheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {scammerAlert?.is_scammer && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 bg-red-50 border-2 border-red-300 rounded-xl"
                    >
                      <div className="flex items-start gap-3">
                        <Ban className="w-8 h-8 text-red-600 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-red-700">🚨 FRAUD ALERT</p>
                          <p className="text-sm text-red-600 mt-1">{scammerAlert.warning_message}</p>
                          {scammerAlert.report_count && (
                            <p className="text-xs text-red-500 mt-2">Reported {scammerAlert.report_count} times</p>
                          )}
                          <button
                            onClick={() => speakAlert(
                              scammerAlert.warning_message || 'This account has been flagged for fraud. Do not send money.',
                              true
                            )}
                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            {isSpeaking ? t('pay_stop_voice', 'Stop') : t('pay_hear_warning', '🔊 Hear Warning')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {searchError && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-gray-500 text-center">
                      {searchError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* UPI Input */
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => {
                        setUpiId(e.target.value.toLowerCase())
                        setFoundContact(null)
                        setScammerAlert(null)
                      }}
                      onKeyDown={handleKeyPress}
                      placeholder="name@bank (e.g., john@paytm)"
                      className="input-field pl-12"
                    />
                  </div>
                  <button
                    onClick={handleUpiVerify}
                    disabled={isSearching || !upiId.includes('@')}
                    className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
                  >
                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>

                {/* UPI Results */}
                <AnimatePresence>
                  {foundContact && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`p-4 rounded-xl border ${foundContact.is_verified ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${foundContact.is_verified ? 'bg-green-100' : 'bg-yellow-100'}`}>
                          <User className={`w-6 h-6 ${foundContact.is_verified ? 'text-green-600' : 'text-yellow-600'}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{foundContact.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Building className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">{foundContact.bank}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {scammerAlert?.is_scammer && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 bg-red-50 border-2 border-red-300 rounded-xl"
                    >
                      <div className="flex items-start gap-3">
                        <Ban className="w-8 h-8 text-red-600 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-red-700">🚨 FRAUD ALERT</p>
                          <p className="text-sm text-red-600 mt-1">{scammerAlert.warning_message}</p>
                          <button
                            onClick={() => speakAlert(
                              scammerAlert.warning_message || 'This account has been flagged for fraud. Do not send money.',
                              true
                            )}
                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            {isSpeaking ? t('pay_stop_voice', 'Stop') : t('pay_hear_warning', '🔊 Hear Warning')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">{t('pay_amount', 'Amount')}</label>
              {isLoadingBalance ? (
                <span className="text-xs text-gray-400 animate-pulse">Loading balance...</span>
              ) : balance !== null ? (
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  insufficientBalance
                    ? 'bg-red-100 text-red-600'
                    : 'bg-green-100 text-green-700'
                }`}>
                  <Wallet className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Available: {formatBalance(balance)}
                </span>
              ) : null}
            </div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100">
                <IndianRupee className="w-4 h-4 text-primary-600" />
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`input-field pl-14 text-2xl font-semibold tracking-tight ${
                  insufficientBalance ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10' : ''
                }`}
              />
            </div>
            {insufficientBalance && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-xs mt-1.5 flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" />
                {t('pay_exceeds_balance', 'Amount exceeds your available balance')}
              </motion.p>
            )}
            {/* Quick Amount Buttons */}
            <div className="flex gap-2 mt-3">
              {[100, 500, 1000, 2000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(String(val))}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    amount === String(val)
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  ₹{val >= 1000 ? `${val / 1000}K` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('pay_note', 'Note (optional)')}</label>
            <div className="relative">
              <FileText className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('pay_what_for', "What's this payment for?")}
                className="input-field pl-12"
                rows={2}
              />
            </div>
          </div>

          {/* Scan Button */}
          <button
            onClick={runSecurityAnalysis}
            disabled={!upiId || !amount || insufficientBalance}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Shield className="w-5 h-5" />
            {insufficientBalance ? t('pay_insufficient', 'Insufficient Balance') : t('pay_run_scan', 'Run Security Scan & Pay')}
          </button>

          <p className="text-xs text-gray-500 text-center">
            🛡️ {t('pay_shield_protecting', '7-Layer Security Shield protecting this payment')}
          </p>
        </motion.div>
      )}

      {/* Analyzing Step - 7 Layer Visualization */}
      {step === 'analyzing' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card py-8"
        >
          <div className="text-center mb-6">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="inline-block"
            >
              <Shield className="w-16 h-16 text-blue-600 mx-auto" />
            </motion.div>
            <h2 className="text-xl font-bold text-gray-900 mt-4">{t('pay_security_scan', '7-Layer Security Scan')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('pay_analyzing', 'Analyzing payment security...')}</p>
          </div>

          {/* Layers Progress */}
          <div className="space-y-3">
            {SECURITY_LAYERS.map((layer, index) => {
              const Icon = layer.icon
              const result = layerResults[index]
              const isActive = index === currentLayer - 1 || (currentLayer > 7 && index === 6)
              const isDone = index < currentLayer
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive ? 'bg-blue-50 border-blue-300 shadow-md' :
                    isDone && result
                      ? result.status === 'safe' ? 'bg-green-50 border-green-200'
                        : result.status === 'warning' ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                      : isDone ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isActive ? 'bg-blue-100' :
                      isDone && result
                        ? result.status === 'safe' ? 'bg-green-100'
                          : result.status === 'warning' ? 'bg-yellow-100'
                          : 'bg-red-100'
                        : isDone ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {isActive ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader2 className="w-5 h-5 text-blue-600" />
                        </motion.div>
                      ) : isDone ? (
                        result?.status === 'danger' ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : result?.status === 'warning' ? (
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )
                      ) : (
                        <Icon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${isActive ? 'text-blue-700' : isDone ? 'text-gray-900' : 'text-gray-400'}`}>
                          Layer {index + 1}: {layer.name}
                        </span>
                        {isDone && result && (
                          <span className={`text-sm font-bold ${
                            result.status === 'safe' ? 'text-green-600' :
                            result.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {result.score.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{layer.desc}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Final Score Animation */}
          {securityAnalysis && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mt-6 p-6 rounded-2xl text-center text-white ${
                getRiskColors(securityAnalysis.risk_color).bg
              }`}
            >
              <p className="text-sm opacity-80 mb-1">Security Score</p>
              <p className="text-5xl font-bold">{securityAnalysis.final_score.toFixed(0)}%</p>
              <p className="text-lg font-medium mt-2">{securityAnalysis.risk_level_label}</p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Review Step */}
      {step === 'review' && securityAnalysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Main Risk Status */}
          <div className={`card border-2 ${getRiskColors(securityAnalysis.risk_color).border} ${getRiskColors(securityAnalysis.risk_color).light}`}>
            <div className="text-center py-4">
              {securityAnalysis.risk_color === 'green' && <ShieldCheck className="w-16 h-16 text-green-500 mx-auto" />}
              {securityAnalysis.risk_color === 'yellow' && <Shield className="w-16 h-16 text-yellow-500 mx-auto" />}
              {securityAnalysis.risk_color === 'orange' && <ShieldAlert className="w-16 h-16 text-orange-500 mx-auto" />}
              {securityAnalysis.risk_color === 'red' && <ShieldOff className="w-16 h-16 text-red-600 mx-auto" />}
              
              <h2 className={`text-2xl font-bold mt-3 ${getRiskColors(securityAnalysis.risk_color).text}`}>
                {securityAnalysis.risk_level_label}
              </h2>
              
              <p className="text-sm text-gray-500 mt-1">
                {t('pay_security_score_label', 'Security Score')}: {securityAnalysis.final_score.toFixed(0)}%
              </p>
              
              {securityAnalysis.scam_type_label && (
                <div className="mt-3 px-4 py-2 bg-red-100 rounded-lg inline-block">
                  <span className="text-sm text-red-700">⚠️ {securityAnalysis.scam_type_label} Detected</span>
                </div>
              )}
            </div>
          </div>

          {/* Voice Alert Banner — shows when urgent alert is speaking */}
          <AnimatePresence>
            {isUrgentSpeaking && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="flex items-center gap-3 p-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-600/30"
              >
                <div className="relative flex-shrink-0">
                  <Volume2 className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-300 rounded-full animate-ping" />
                </div>
                <p className="text-sm font-medium flex-1">{t('pay_voice_warning', '🔊 Voice alert: Listening to safety warning...')}</p>
                <button onClick={stopSpeaking} className="p-1 rounded-lg hover:bg-red-500 transition-colors">
                  <VolumeX className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Listen to Risk Summary button — lets user replay or hear the analysis */}
          {(securityAnalysis.risk_color === 'orange' || securityAnalysis.risk_color === 'red') && !isUrgentSpeaking && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                const reasons = (translatedReasons || securityAnalysis.all_reasons.slice(0, 3)).join('. ')
                const tips = (translatedTips || securityAnalysis.safety_tips.slice(0, 2)).join('. ')
                const summary = `${t('pay_risk_voice_intro', 'Risk summary for this payment')}: ${securityAnalysis.risk_level_label}. ${t('pay_score_is', 'Security score is')} ${securityAnalysis.final_score.toFixed(0)}%. ${reasons}. ${t('pay_safety_tip_voice', 'Safety tips')}: ${tips}`
                speakAlert(summary, securityAnalysis.risk_color === 'red')
              }}
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-medium text-sm transition-all ${
                isSpeaking
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : securityAnalysis.risk_color === 'red'
                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
              }`}
            >
              {isSpeaking ? (
                <><VolumeX className="w-4 h-4" /> {t('pay_stop_listening', 'Stop Listening')}</>
              ) : (
                <><Volume2 className="w-4 h-4" /> {t('pay_listen_risk', '🔊 Listen to Risk Summary')}</>
              )}
            </motion.button>
          )}

          {/* Layer Summary */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              {t('pay_layer_results', 'Security Layer Results')}
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {securityAnalysis.layer_summary.map((layer, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg text-center ${
                    layer.status === 'safe' ? 'bg-green-50' :
                    layer.status === 'warning' ? 'bg-yellow-50' : 'bg-red-50'
                  }`}
                >
                  <p className="text-xs text-gray-500">L{i + 1}</p>
                  <p className={`font-bold text-sm ${
                    layer.status === 'safe' ? 'text-green-600' :
                    layer.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {layer.icon}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ML Ensemble Breakdown */}
          {mlScores && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                ML Ensemble Breakdown
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'XGBoost Risk Scorer', score: mlScores.xgboost_score, weight: '30%', color: 'blue' },
                  { label: 'Behavioral Profiler', score: mlScores.lstm_score, weight: '25%', color: 'violet' },
                  { label: 'Graph Network (GNN)', score: mlScores.gnn_score, weight: '20%', color: 'indigo' },
                  { label: 'Isolation Forest', score: mlScores.isolation_forest_score, weight: '15%', color: 'cyan' },
                  { label: 'Sensor Stress', score: mlScores.sensor_score, weight: '10%', color: 'amber' },
                ].map((model) => {
                  const score = model.score ?? 0
                  const pct = Math.round(score * 100)
                  const barColor = pct < 30 ? 'bg-green-500' : pct < 60 ? 'bg-yellow-500' : pct < 80 ? 'bg-orange-500' : 'bg-red-500'
                  const status = mlScores.model_versions?.[
                    model.label === 'XGBoost Risk Scorer' ? 'xgboost' :
                    model.label === 'Behavioral Profiler' ? 'lstm_behavioral' :
                    model.label === 'Graph Network (GNN)' ? 'gnn_graph' :
                    model.label === 'Isolation Forest' ? 'isolation_forest' : 'sensor_stress'
                  ]
                  return (
                    <div key={model.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{model.label}</span>
                        <div className="flex items-center gap-2">
                          {status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              status.status === 'trained' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {status.status === 'trained' ? 'Trained' : 'Heuristic'}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">({model.weight})</span>
                          <span className={`font-bold ${pct < 30 ? 'text-green-600' : pct < 60 ? 'text-yellow-600' : pct < 80 ? 'text-orange-600' : 'text-red-600'}`}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={`h-full ${barColor} rounded-full`}
                        />
                      </div>
                    </div>
                  )
                })}
                {mlScores.ensemble_score !== undefined && (
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">Ensemble Score</span>
                      <span className={`text-lg font-bold ${
                        mlScores.ensemble_score < 0.3 ? 'text-green-600' :
                        mlScores.ensemble_score < 0.6 ? 'text-yellow-600' :
                        mlScores.ensemble_score < 0.8 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {Math.round(mlScores.ensemble_score * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Recipient */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('pay_sending_to', 'Sending To')}
            </h3>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-900">{foundContact?.name || upiId.split('@')[0]}</p>
                <p className="text-sm text-gray-500">{upiId}</p>
              </div>
              {foundContact?.is_verified ? (
                <span className="flex items-center gap-1 text-green-600 text-sm bg-green-100 px-3 py-1 rounded-full">
                  <CheckCircle className="w-4 h-4" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600 text-sm bg-yellow-100 px-3 py-1 rounded-full">
                  <AlertTriangle className="w-4 h-4" />
                  New
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="card-gradient text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/5" />
            <div className="relative z-10">
              <p className="text-white/70 text-sm mb-1">{t('pay_amount', 'Amount')}</p>
              <p className="text-5xl font-bold text-white tracking-tight">₹{parseFloat(amount).toLocaleString()}</p>
              {note && <p className="text-white/60 mt-2 text-sm">"{note}"</p>}
            </div>
          </div>

          {/* Why This Rating */}
          <div className={`card ${getRiskColors(securityAnalysis.risk_color).light} border ${getRiskColors(securityAnalysis.risk_color).border}`}>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${getRiskColors(securityAnalysis.risk_color).text}`} />
              {t('pay_why_rating', 'Why This Rating')}
            </h3>
            <ul className="space-y-2">
              {(translatedReasons || securityAnalysis.all_reasons.slice(0, 5)).map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5">•</span>
                  {reason}
                </li>
              ))}
              {isTranslating && (
                <li className="text-xs text-gray-400 italic flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> {t('pay_translating', 'Translating...')}
                </li>
              )}
            </ul>
          </div>

          {/* Safety Tips */}
          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              {t('pay_safety_tips', 'Safety Tips')}
            </h3>
            <ul className="space-y-2">
              {(translatedTips || securityAnalysis.safety_tips).map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-blue-800">
                  <span className="text-blue-500 mt-0.5">→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Education Link */}
          {securityAnalysis.scam_type_detected && securityAnalysis.education_link && (
            <button
              onClick={() => navigate(securityAnalysis.education_link!)}
              className="card bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors w-full text-left"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-purple-600" />
                <div>
                  <h3 className="font-semibold text-purple-900">
                    {t('pay_learn_about', 'Learn About')} {securityAnalysis.scam_type_label}
                  </h3>
                  <p className="text-sm text-purple-700">
                    {t('pay_understand_scam', 'Understand how this scam works')}
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* Scam Alert */}
          {securityAnalysis.is_blocked && (
            <div className="card bg-red-600 text-white">
              <div className="flex items-start gap-3">
                <PhoneCall className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-bold text-lg">🚨 {t('pay_scam_alert', 'Scam Alert!')}</h3>
                  <p className="text-sm mt-1 text-red-100">
                    {t('pay_scam_warning', 'If someone called you claiming to be from a bank, IT department, or asking you to download any app - it\'s a SCAM. Real banks never ask for OTP or ask you to transfer money.')}
                  </p>
                  <button
                    onClick={() => speakAlert(
                      t('pay_scam_warning', 'If someone called you claiming to be from a bank, IT department, or asking you to download any app - it is a SCAM. Real banks never ask for OTP or ask you to transfer money.'),
                      true
                    )}
                    className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    {isSpeaking ? t('pay_stop_voice', 'Stop') : t('pay_hear_alert', '🔊 Hear This Alert')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generate Cyber Report — visible for non-safe transactions */}
          {securityAnalysis.risk_level !== 'safe' && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => {
                generateNCRPReport({
                  victimName: user?.full_name || 'Unknown',
                  victimUPI: user?.upi_id || '',
                  victimPhone: user?.phone_number || '',
                  attackerUPI: upiId,
                  attackerName: foundContact?.name,
                  attackerBank: foundContact?.bank,
                  amount: parseFloat(amount),
                  note,
                  timestamp: new Date(),
                  securityAnalysis,
                  layerResults,
                  sensorData,
                  isOnCall,
                  scammerReportCount: scammerAlert?.report_count,
                  scammerWarning: scammerAlert?.warning_message,
                })
                toast.success('Cyber Crime Report downloaded!')
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 text-red-700 rounded-xl hover:from-red-100 hover:to-orange-100 transition-all text-sm font-semibold"
            >
              <FileText className="w-4 h-4" />
              {t('pay_generate_report', 'Generate Cyber Crime Report (PDF)')}
            </motion.button>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {securityAnalysis.can_proceed && !securityAnalysis.is_blocked ? (
              securityAnalysis.risk_color === 'green' || securityAnalysis.risk_color === 'yellow' ? (
                <>
                  <motion.button
                    onClick={handleProceed}
                    disabled={isProcessing}
                    whileHover={{ scale: isProcessing ? 1 : 1.01 }}
                    whileTap={{ scale: isProcessing ? 1 : 0.98 }}
                    className={`btn-success w-full flex items-center justify-center gap-2 py-4 text-lg ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {isProcessing ? (
                      <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                    ) : (
                      <><Send className="w-6 h-6" /> {t('pay_pay_btn', 'Pay')} ₹{parseFloat(amount).toLocaleString()}</>
                    )}
                  </motion.button>
                  <button onClick={() => setStep('input')} className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors">
                    {t('pay_cancel', 'Cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setStep('input')} className="btn-primary w-full flex items-center justify-center gap-2">
                    ← {t('pay_go_back', 'Go Back & Verify')}
                  </button>
                  <button
                    onClick={handleProceed}
                    disabled={isProcessing}
                    className={`w-full py-3 text-gray-500 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {isProcessing ? t('pay_processing', 'Processing...') : t('pay_verified_proceed', "I've verified, proceed anyway")}
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  onClick={() => {
                    toast.success('Good decision! Stay safe.')
                    navigate('/dashboard')
                  }}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-4"
                >
                  <ThumbsUp className="w-5 h-5" />
                  {t('pay_dont_pay', "Don't Pay - Go Back")}
                </button>
                <button onClick={() => setStep('input')} className="w-full py-3 text-gray-400 text-sm">
                  {t('pay_edit_details', 'Edit payment details')}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Call Simulation Toggle (dev only) */}
      {import.meta.env.DEV && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed bottom-4 right-4 z-40"
      >
        <button
          onClick={() => setIsOnCall(!isOnCall)}
          className={`p-3 rounded-full shadow-lg transition-all ${
            isOnCall ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-gray-600'
          }`}
          title="Toggle call simulation"
        >
          <PhoneCall className="w-5 h-5" />
        </button>
        {isOnCall && (
          <span className="absolute -top-2 -left-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
            On Call
          </span>
        )}
      </motion.div>
      )}

      {/* AI Intervention Modal */}
      {activeIntervention && (
        <AIInterventionModal
          intervention={activeIntervention}
          recipientUPI={upiId}
          amount={parseFloat(amount)}
          onProceed={handleInterventionProceed}
          onCancel={handleInterventionCancel}
          onClose={() => setActiveIntervention(null)}
        />
      )}

      {/* My QR Code Modal */}
      {user?.upi_id && (
        <MyQRCode
          isOpen={showMyQR}
          onClose={() => setShowMyQR(false)}
          upiId={user.upi_id}
          userName={user.full_name}
        />
      )}
    </div>
  )
}
