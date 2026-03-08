/**
 * Scam Education Page
 * ====================
 * Learn about different types of scams and how to protect yourself
 * This is a KEY differentiator - we EDUCATE not just BLOCK
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield,
  AlertTriangle,
  BookOpen,
  CheckCircle,
  XCircle,
  Phone,
  UserX,
  DollarSign,
  ArrowLeft,
  Users,
  Trophy,
  Share2,
  Flag
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

interface ScamEducationContent {
  scam_type: string
  title: string
  description: string
  how_it_works: string[]
  red_flags: string[]
  protection_tips: string[]
  real_example: string
  victim_count_india: string
  avg_loss_amount: string
}

// Fallback content if API fails
const SCAM_CONTENT: Record<string, ScamEducationContent> = {
  lottery: {
    scam_type: 'lottery',
    title: '🎰 Lottery/Prize Scam',
    description: 'Scammers contact you claiming you\'ve won a lottery or prize, then ask for "processing fees" or "taxes" to release your winnings.',
    how_it_works: [
      'You receive a call/SMS saying you\'ve won a lottery or contest',
      'The caller sounds professional and may even have a fake "company website"',
      'They ask for a small "processing fee" (₹5,000-50,000) to release your prize',
      'Once paid, they ask for more fees - "tax", "insurance", "clearance"',
      'They may ask you to share screen or download apps like AnyDesk'
    ],
    red_flags: [
      'You never entered any lottery or contest',
      'They\'re asking for money to give you money',
      'Urgency: "Pay within 24 hours or lose the prize"',
      'They refuse to meet in person',
      'Payment to personal accounts, not company accounts'
    ],
    protection_tips: [
      'You can\'t win a lottery you never entered',
      'Never pay money to receive prize money',
      'Real lotteries deduct taxes from winnings',
      'Never share OTP or download screen-sharing apps',
      'Report such calls to cybercrime.gov.in'
    ],
    real_example: 'A 58-year-old retired teacher lost ₹12 lakh after receiving an SMS about winning "KBC Lottery". The scammers made her pay "taxes" in 15 installments over 3 months.',
    victim_count_india: '45,000+',
    avg_loss_amount: '₹2.5 Lakh'
  },
  kyc_fraud: {
    scam_type: 'kyc_fraud',
    title: '📋 KYC Update Fraud',
    description: 'Scammers pose as bank officials asking you to update your KYC documents, then steal your money.',
    how_it_works: [
      'You receive a call claiming your bank account will be blocked',
      'The caller says you need to update KYC immediately',
      'They send a link to a fake website that looks like your bank',
      'You enter your credentials which go directly to scammers',
      'They ask for OTP to "verify" - but actually to steal money'
    ],
    red_flags: [
      'Banks NEVER call and ask for your password or OTP',
      'Urgency: "Your account will be blocked in 2 hours"',
      'Links to websites that aren\'t your bank\'s official site',
      'Asking you to download apps or share screen',
      'Caller gets aggressive when you ask questions'
    ],
    protection_tips: [
      'Banks never ask for PIN, OTP, or password on call',
      'Always visit bank website by typing URL directly',
      'Call your bank\'s official helpline if unsure',
      'KYC is done at bank branch, not over phone',
      'Enable SMS alerts for all transactions'
    ],
    real_example: 'A software engineer lost ₹8.5 lakh when a "bank official" called about KYC. The scammer made him share screen via AnyDesk and transferred money while he watched.',
    victim_count_india: '78,000+',
    avg_loss_amount: '₹1.8 Lakh'
  },
  digital_arrest: {
    scam_type: 'digital_arrest',
    title: '👮 Digital Arrest Scam',
    description: 'Scammers impersonate police/CBI/customs and threaten you with fake arrest, demanding money to "settle the case".',
    how_it_works: [
      'You receive a call from "Police" or "CBI" about illegal activity linked to your ID',
      'They claim your Aadhaar was used for money laundering or drug trafficking',
      'Video call shows people in police uniforms with fake official background',
      'They threaten immediate arrest if you don\'t cooperate',
      'They demand money transfer to "clear your name" or for "bail"'
    ],
    red_flags: [
      'Real police don\'t make video calls for investigations',
      'No "digital arrest" concept exists in Indian law',
      'They want you to stay on call continuously',
      'Asking for money transfer to personal accounts',
      'Threats of immediate arrest and public humiliation'
    ],
    protection_tips: [
      'Police NEVER demand money on phone calls',
      'No one can be arrested over a video call',
      'Hang up and call 100 (police) to verify',
      'Never make payments under pressure',
      'Record such calls and report to cybercrime.gov.in'
    ],
    real_example: 'A college professor was kept on video call for 8 hours by fake CBI officers. Under extreme fear and pressure, she transferred ₹75 lakh to "prove her innocence".',
    victim_count_india: '25,000+',
    avg_loss_amount: '₹15 Lakh'
  },
  refund_scam: {
    scam_type: 'refund_scam',
    title: '💰 Refund/Cashback Scam',
    description: 'Scammers contact you about pending refunds, then steal money instead of giving refunds.',
    how_it_works: [
      'You receive SMS about pending refund from a company/bank',
      'Call asks you to install AnyDesk/TeamViewer for "verification"',
      'They ask you to enter ₹1 for "testing" with your PIN',
      'While you\'re distracted, they transfer large amounts',
      'Some ask you to fill a form with banking details'
    ],
    red_flags: [
      'Legitimate refunds never require app installation',
      'No company asks for PIN to give you money',
      'Refunds happen automatically to original payment method',
      'Links to non-official websites',
      'Caller insisting on doing it "right now"'
    ],
    protection_tips: [
      'Refunds don\'t need your banking password or PIN',
      'Never install screen-sharing apps for refunds',
      'Contact company directly using official website',
      'If in doubt, wait - scammers create urgency',
      'Check transaction history yourself in bank app'
    ],
    real_example: 'A young professional lost ₹3.5 lakh when he installed AnyDesk for a "₹500 electricity refund". The scammer transferred money while he thought he was receiving ₹500.',
    victim_count_india: '62,000+',
    avg_loss_amount: '₹85,000'
  },
  fake_support: {
    scam_type: 'fake_support',
    title: '🎧 Fake Customer Support',
    description: 'Scammers create fake customer care numbers that show up in Google search, then steal money when you call.',
    how_it_works: [
      'You search for customer care number on Google',
      'You find a number that looks official but is fake',
      'When you call, they "help" you by asking for account details',
      'They may send fake links or ask to download apps',
      'While pretending to help, they empty your account'
    ],
    red_flags: [
      'Number found on random websites, not official site',
      'Customer care asking for OTP or PIN',
      'Asking to install apps for "technical support"',
      'Refund process requires you to make a payment first',
      'They get aggressive when questioned'
    ],
    protection_tips: [
      'Only use numbers from official company website',
      'Never share OTP even with "customer support"',
      'Legitimate support never asks for your PIN',
      'Save official helpline numbers in your phone',
      'Verify by calling back on app-listed number'
    ],
    real_example: 'A businessman called a fake Paytm customer care for a ₹2,000 refund. The scammer made him transfer ₹4.8 lakh while "processing the refund".',
    victim_count_india: '89,000+',
    avg_loss_amount: '₹1.2 Lakh'
  }
}

export default function ScamEducation() {
  const { scamType } = useParams()
  const navigate = useNavigate()
  const [content, setContent] = useState<ScamEducationContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [completedQuiz, setCompletedQuiz] = useState(false)

  useEffect(() => {
    loadContent()
  }, [scamType])

  const loadContent = async () => {
    setLoading(true)
    
    try {
      // Try to fetch from API
      const response = await api.get(`/security/scam-education/${scamType}`)
      setContent(response.data)
    } catch (error) {
      // Use fallback content
      const fallback = SCAM_CONTENT[scamType || 'lottery']
      if (fallback) {
        setContent(fallback)
      } else {
        setContent(SCAM_CONTENT.lottery) // Default to lottery
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteQuiz = () => {
    setCompletedQuiz(true)
    toast.success('🎉 You earned +25 Security Points!')
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: content?.title || 'ScamShield - Learn About Scams',
        text: `Learn how to protect yourself from ${content?.title || 'scams'}`,
        url: window.location.href
      })
    } else {
      toast.success('Link copied! Share with friends and family.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Content Not Found</h2>
        <button onClick={() => navigate('/dashboard')} className="btn-primary mt-4">
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm mb-4">
          <BookOpen className="w-4 h-4" />
          Scam Education
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{content.title}</h1>
        <p className="text-gray-600 mt-2">{content.description}</p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card bg-red-50 border border-red-200"
        >
          <div className="flex items-center gap-3">
            <Users className="w-10 h-10 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">{content.victim_count_india}</p>
              <p className="text-sm text-red-600">Victims in India</p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card bg-orange-50 border border-orange-200"
        >
          <div className="flex items-center gap-3">
            <DollarSign className="w-10 h-10 text-orange-600" />
            <div>
              <p className="text-2xl font-bold text-orange-700">{content.avg_loss_amount}</p>
              <p className="text-sm text-orange-600">Average Loss</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          How This Scam Works
        </h2>
        <ol className="space-y-3">
          {content.how_it_works.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-sm font-bold">
                {i + 1}
              </span>
              <span className="text-gray-700">{step}</span>
            </li>
          ))}
        </ol>
      </motion.div>

      {/* Red Flags */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card bg-red-50 border border-red-200"
      >
        <h2 className="font-bold text-red-800 mb-4 flex items-center gap-2">
          <Flag className="w-5 h-5 text-red-600" />
          Red Flags to Watch For
        </h2>
        <ul className="space-y-2">
          {content.red_flags.map((flag, i) => (
            <li key={i} className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-red-700">{flag}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Protection Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card bg-green-50 border border-green-200"
      >
        <h2 className="font-bold text-green-800 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-600" />
          How to Protect Yourself
        </h2>
        <ul className="space-y-2">
          {content.protection_tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-green-700">{tip}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Real Example */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card bg-gray-800 text-white"
      >
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <UserX className="w-5 h-5 text-red-400" />
          Real Case Study
        </h2>
        <p className="text-gray-300 leading-relaxed">{content.real_example}</p>
      </motion.div>

      {/* Quick Quiz */}
      {!completedQuiz ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card border-2 border-purple-200"
        >
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-purple-600" />
            Quick Quiz - Earn Points!
          </h2>
          <p className="text-gray-600 mb-4">
            Answer this question correctly to earn +25 Security Points:
          </p>
          <p className="font-medium text-gray-900 mb-4">
            "A caller says your bank account will be blocked unless you share OTP. What should you do?"
          </p>
          <div className="space-y-2">
            <button
              onClick={() => toast.error('Wrong! Never share OTP with anyone.')}
              className="w-full p-3 text-left border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              A) Share OTP immediately to avoid account block
            </button>
            <button
              onClick={handleCompleteQuiz}
              className="w-full p-3 text-left border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              B) Hang up and call bank's official number to verify
            </button>
            <button
              onClick={() => toast.error('Wrong! Never do transactions under pressure.')}
              className="w-full p-3 text-left border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              C) Transfer money to "secure" your account
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card bg-green-50 border border-green-200 text-center"
        >
          <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="font-bold text-green-800">Congratulations!</h3>
          <p className="text-green-700">You've earned +25 Security Points</p>
          <p className="text-sm text-green-600 mt-2">
            Keep learning to stay protected from scams
          </p>
        </motion.div>
      )}

      {/* Share Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="card bg-blue-50 border border-blue-200"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-blue-900">Help Others Stay Safe</h3>
            <p className="text-sm text-blue-700">Share this with friends & family</p>
          </div>
          <button
            onClick={handleShare}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {/* Emergency Helpline */}
      <div className="card bg-red-600 text-white text-center">
        <Phone className="w-8 h-8 mx-auto mb-2" />
        <p className="font-bold">If You're Being Scammed Right Now</p>
        <p className="text-red-100 text-sm mt-1">
          Call National Cybercrime Helpline: <span className="font-bold">1930</span>
        </p>
        <p className="text-red-200 text-xs mt-2">
          Or visit cybercrime.gov.in
        </p>
      </div>
    </div>
  )
}
