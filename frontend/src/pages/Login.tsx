import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, 
  Phone, 
  Lock, 
  ArrowRight, 
  User, 
  Mail,
  CheckCircle,
  Sparkles,
  Zap,
  ShieldCheck,
  ChevronLeft,
  RefreshCw,
  Info,
  Copy,
  X,
  Building2
} from 'lucide-react'
import { authAPI } from '../api/client'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'
import { isFirebaseConfigured, sendOTP, verifyOTP as confirmFirebaseOTP } from '../services/firebase'

export default function Login() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  
  // Steps: phone -> otp -> bank_detection -> register (for new users only)
  const [step, setStep] = useState<'phone' | 'otp' | 'bank_detection' | 'register'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [demoOtp, setDemoOtp] = useState('')
  const [showDemoOtpModal, setShowDemoOtpModal] = useState(false)
  const [_isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Registration fields (for new users)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [firebaseUid, setFirebaseUid] = useState('')
  
  // Auto-detected bank info (simulating real UPI apps)
  const [detectedBank, setDetectedBank] = useState<{name: string, lastFour: string, upiId: string, balance: number} | null>(null)
  const [isDetectingBank, setIsDetectingBank] = useState(false)
  
  // Store phone for registration
  const [verifiedPhone, setVerifiedPhone] = useState('')

  const copyOtpToClipboard = () => {
    navigator.clipboard.writeText(demoOtp)
    toast.success('OTP copied!')
  }
  
  // Simulate bank detection (like real UPI apps)
  const detectBankAccounts = async () => {
    setIsDetectingBank(true)
    
    // Simulate API call to detect linked bank accounts
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Generate realistic bank info based on phone number
    const bankNames = ['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra']
    const upiHandles = ['@okhdfc', '@oksbi', '@okicici', '@okaxis', '@kotak']
    const randomIndex = parseInt(phone.slice(-1)) % bankNames.length
    
    setDetectedBank({
      name: bankNames[randomIndex],
      lastFour: phone.slice(-4),
      upiId: `${phone}${upiHandles[randomIndex]}`,
      balance: 10000 // Initial sandbox balance, updates dynamically via wallet API
    })
    
    setIsDetectingBank(false)
  }

  // Step 1: Request OTP
  const handleRequestOTP = async () => {
    if (phone.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number')
      return
    }

    setLoading(true)
    try {
      if (isFirebaseConfigured) {
        // Real Firebase Phone OTP delivery
        await sendOTP(`+91${phone}`)
        toast.success('OTP code sent to your phone via SMS!')
        setVerifiedPhone(`+91${phone}`)
        setStep('otp')
      } else {
        // Fallback to local dev OTP delivery
        const response = await authAPI.requestOTP(`+91${phone}`)
        
        if (response.data.demo_otp) {
          setDemoOtp(response.data.demo_otp)
          setIsDemo(response.data.is_demo ?? false)
          setShowDemoOtpModal(true)
        } else {
          toast.success('OTP sent to your phone!')
          setIsDemo(false)
        }
        setVerifiedPhone(`+91${phone}`)
        setStep('otp')
      }
    } catch (error: any) {
      console.error('OTP error:', error)
      toast.error(error.message || error.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP
  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error('Please enter the 6-digit OTP')
      return
    }

    setLoading(true)
    try {
      let response;
      if (isFirebaseConfigured) {
        // 1. Verify code with Firebase to get Firebase ID token
        const idToken = await confirmFirebaseOTP(otp)
        // 2. Post ID token to backend verify route
        response = await authAPI.verifyFirebaseToken(idToken)
      } else {
        // Fallback to local dev OTP verify
        response = await authAPI.verifyOTP(verifiedPhone, otp)
      }

      const { access_token, user, is_new_user, suggested_name, phone_number, firebase_uid } = response.data

      if (is_new_user) {
        // New user - go to bank detection step (like real UPI apps)
        toast.success('OTP verified! Detecting your bank accounts...')
        
        // Auto-fill name if we found contact info
        if (suggested_name) {
          setFullName(suggested_name)
        }
        
        // Save verified details for registration
        if (phone_number) {
          setVerifiedPhone(phone_number)
        }
        if (firebase_uid) {
          setFirebaseUid(firebase_uid)
        }
        
        // Start bank detection
        setStep('bank_detection')
        detectBankAccounts()
      } else {
        // Existing user - login directly
        setAuth(access_token, user)
        toast.success(`Welcome back, ${user.full_name}!`)
        navigate('/dashboard')
      }
    } catch (error: any) {
      console.error('Verify error:', error)
      toast.error(error.message || error.response?.data?.detail || 'Invalid OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Register new user
  const handleRegister = async () => {
    if (fullName.length < 2) {
      toast.error('Please enter your full name')
      return
    }

    // Use auto-detected UPI ID from bank
    const generatedUpiId = detectedBank?.upiId || `${phone}@upisafeguard`

    setLoading(true)
    try {
      const response = await authAPI.register({
        phone_number: verifiedPhone,
        full_name: fullName,
        upi_id: generatedUpiId,
        email: email || undefined,
        firebase_uid: firebaseUid || undefined,
      })
      
      const { access_token, user } = response.data
      setAuth(access_token, user)
      toast.success(`Account created! Your UPI: ${generatedUpiId}`)
      navigate('/dashboard')
    } catch (error: any) {
      console.error('Registration error:', error)
      toast.error(error.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  // Proceed from bank detection to registration
  const handleBankConfirm = () => {
    if (!detectedBank) return
    toast.success(`Bank account linked: ${detectedBank.name}`)
    setStep('register')
  }

  // Demo login — only available in development mode
  const isDev = import.meta.env.DEV
  const handleDemoLogin = async () => {
    if (!isDev) return
    try {
      // Use real OTP flow with demo number
      const res = await authAPI.requestOTP('+919876543210')
      if (res.data.demo_otp) {
        const verifyRes = await authAPI.verifyOTP('+919876543210', res.data.demo_otp)
        if (verifyRes.data.access_token && verifyRes.data.user) {
          setAuth(verifyRes.data.access_token, verifyRes.data.user)
          toast.success('Logged in as Demo User')
          navigate('/dashboard')
        } else {
          // New user — need registration, just fill the phone for them
          setPhone('9876543210')
          setStep('phone')
          toast('Demo number ready — click Get OTP', { icon: 'ℹ️' })
        }
      } else {
        setPhone('9876543210')
        setStep('phone')
        toast('Demo number ready — click Get OTP', { icon: 'ℹ️' })
      }
    } catch {
      setPhone('9876543210')
      setStep('phone')
      toast('Demo number ready — click Get OTP', { icon: 'ℹ️' })
    }
  }

  // Resend OTP
  const handleResendOTP = async () => {
    setOtp('')
    await handleRequestOTP()
  }

  const stepNames = ['Phone', 'Verify', 'Bank', 'Profile']
  const currentStepIndex = step === 'phone' ? 0 : step === 'otp' ? 1 : step === 'bank_detection' ? 2 : 3

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Premium Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-violet-900" />
      
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-5s' }} />
      </div>
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Card */}
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-premium-lg p-8 border border-white/20">
            {/* Header */}
            <div className="text-center mb-8">
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1],
                  rotate: [0, 2, -2, 0]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative inline-block mb-4"
              >
                <div className="absolute inset-0 bg-primary-500/30 rounded-2xl blur-xl animate-pulse" />
                <div className="relative bg-gradient-to-br from-primary-500 to-primary-700 p-4 rounded-2xl shadow-lg">
                  <Shield className="w-10 h-10 text-white" />
                </div>
              </motion.div>
              
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-primary-800 to-primary-600 bg-clip-text text-transparent">
                UPI SafeGuard
              </h1>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                <span className="text-sm text-primary-600 font-medium">Secure Payments</span>
              </div>
              
              <p className="text-gray-500 mt-4 text-sm">
                {step === 'phone' && 'Enter your phone number to get started'}
                {step === 'otp' && 'Enter the OTP sent to your phone'}
                {step === 'bank_detection' && 'Linking your bank account securely'}
                {step === 'register' && 'Just confirm your name to continue'}
              </p>
              
              {/* Premium Progress indicator */}
              <div className="flex justify-center gap-3 mt-6">
                {stepNames.map((name, index) => (
                  <div key={name} className="flex items-center gap-2">
                    <motion.div 
                      className={`relative h-2 w-10 rounded-full overflow-hidden ${
                        index <= currentStepIndex ? 'bg-primary-100' : 'bg-gray-100'
                      }`}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: index < currentStepIndex ? '100%' : index === currentStepIndex ? '50%' : '0%' }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                        transition={{ duration: 0.5 }}
                      />
                    </motion.div>
                    {index < stepNames.length - 1 && (
                      <div className={`w-1 h-1 rounded-full ${index < currentStepIndex ? 'bg-primary-500' : 'bg-gray-300'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {/* Step 1: Phone Input */}
              {step === 'phone' && (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-violet-500 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative bg-white rounded-xl">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <div className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">
                        +91
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Enter phone number"
                        className="w-full pl-[4.5rem] pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary-500 text-lg font-medium transition-colors bg-transparent"
                        maxLength={10}
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleRequestOTP}
                    disabled={loading || phone.length !== 10}
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 disabled:from-gray-300 disabled:to-gray-400 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-500/25 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        Get OTP
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>

                  {import.meta.env.DEV && (
                  <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-gray-400 font-medium">or try demo</span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleDemoLogin}
                    className="w-full border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-5 h-5" />
                    Quick Start
                  </motion.button>
                  </>
                  )}
                </motion.div>
              )}

              {/* Step 2: OTP Input */}
              {step === 'otp' && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Demo OTP Display - Premium Style */}
                  {demoOtp && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative overflow-hidden bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-5 text-center"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-200/30 rounded-full blur-2xl" />
                      <div className="relative">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          <p className="text-emerald-700 text-sm font-medium">Demo Mode - Your OTP</p>
                        </div>
                        <p className="font-bold text-4xl text-emerald-600 tracking-[0.3em] font-mono">{demoOtp}</p>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center justify-center gap-2 py-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 text-sm">OTP sent to</span>
                    <span className="font-semibold text-gray-900">{verifiedPhone}</span>
                  </div>
                  
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-violet-500 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative bg-white rounded-xl">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="• • • • • •"
                        className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary-500 text-2xl text-center tracking-[0.5em] font-mono font-bold transition-colors bg-transparent"
                        maxLength={6}
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleVerifyOTP}
                    disabled={loading || otp.length !== 6}
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 disabled:from-gray-300 disabled:to-gray-400 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-500/25 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify OTP
                        <CheckCircle className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>

                  <div className="flex justify-between text-sm pt-2">
                    <button
                      onClick={() => { setStep('phone'); setOtp(''); setDemoOtp('') }}
                      className="text-gray-500 hover:text-primary-600 font-medium flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Change number
                    </button>
                    <button
                      onClick={handleResendOTP}
                      className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 transition-colors"
                      disabled={loading}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Resend OTP
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step: Bank Detection (like real UPI apps) */}
              {step === 'bank_detection' && (
                <motion.div
                  key="bank_detection"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-blue-800 text-sm font-medium">Phone Verified</p>
                      <p className="text-blue-600 text-xs">{verifiedPhone}</p>
                    </div>
                  </div>

                  {isDetectingBank ? (
                    <div className="text-center py-8">
                      <div className="relative w-20 h-20 mx-auto mb-4">
                        <div className="absolute inset-0 border-4 border-primary-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                        <Building2 className="absolute inset-0 m-auto w-8 h-8 text-primary-600" />
                      </div>
                      <p className="text-gray-700 font-medium">Detecting Bank Accounts...</p>
                      <p className="text-sm text-gray-500 mt-1">Securely connecting to banks linked with your mobile</p>
                    </div>
                  ) : detectedBank ? (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 text-center">Bank account found linked to your mobile number</p>
                      
                      <div className="bg-white border-2 border-primary-500 rounded-2xl p-4 shadow-lg shadow-primary-500/10">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{detectedBank.name}</p>
                            <p className="text-sm text-gray-500">A/c ending ****{detectedBank.lastFour}</p>
                          </div>
                          <CheckCircle className="w-6 h-6 text-emerald-500" />
                        </div>
                        
                        <div className="border-t border-gray-100 pt-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">UPI ID</span>
                            <span className="font-mono text-sm font-medium text-primary-700">{detectedBank.upiId}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Available Balance</span>
                            <span className="font-semibold text-emerald-600">₹{detectedBank.balance.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleBankConfirm}
                        className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-500/25"
                      >
                        Link This Account
                        <ArrowRight className="w-5 h-5" />
                      </motion.button>
                      
                      <p className="text-xs text-gray-400 text-center">
                        Your UPI ID will be auto-configured based on your linked bank
                      </p>
                    </div>
                  ) : null}
                </motion.div>
              )}

              {/* Step 3: Registration - Just confirm name */}
              {step === 'register' && (
                <motion.div
                  key="register"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Linked Bank Info */}
                  {detectedBank && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                          <Building2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-emerald-800 text-sm font-medium">{detectedBank.name} Linked</p>
                          <p className="text-emerald-600 text-xs font-mono">{detectedBank.upiId}</p>
                        </div>
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      </div>
                    </div>
                  )}

                  {/* Full Name */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-violet-500 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative bg-white rounded-xl">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Full Name *"
                        className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary-500 font-medium transition-colors bg-transparent"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Email (optional) */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-violet-500 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative bg-white rounded-xl">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email (optional)"
                        className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary-500 font-medium transition-colors bg-transparent"
                      />
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleRegister}
                    disabled={loading || fullName.length < 2}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>

                  <p className="text-xs text-gray-400 text-center">
                    Your account will be created with an initial balance
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Terms */}
            <p className="text-xs text-gray-400 text-center mt-8">
              By continuing, you agree to our{' '}
              <span className="text-primary-600 hover:underline cursor-pointer">Terms of Service</span>
              {' '}and{' '}
              <span className="text-primary-600 hover:underline cursor-pointer">Privacy Policy</span>
            </p>
          </div>

          {/* Features Banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 flex justify-center gap-6 text-white/70 text-xs"
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Fraud Protection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              <span>Real-time Analysis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              <span>Bank-grade Security</span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Demo OTP Modal */}
      <AnimatePresence>
        {showDemoOtpModal && demoOtp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDemoOtpModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Info className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Demo Mode</h3>
                    <p className="text-xs text-gray-500">Test phone number detected</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDemoOtpModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-2xl p-4 text-center mb-4">
                <p className="text-sm text-gray-600 mb-2">Your verification code is</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl font-mono font-bold tracking-widest text-primary-700">
                    {demoOtp}
                  </span>
                  <button
                    onClick={copyOtpToClipboard}
                    className="p-2 hover:bg-white rounded-lg transition-colors"
                    title="Copy OTP"
                  >
                    <Copy className="w-5 h-5 text-primary-600" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center mb-4">
                This is a demo number. In production, OTP would be sent via SMS.
              </p>

              <button
                onClick={() => setShowDemoOtpModal(false)}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
