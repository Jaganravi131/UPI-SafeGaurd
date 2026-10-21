import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  QrCode,
  ArrowLeft,
  Shield,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Smartphone,
  AtSign,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import QRScanner from '../components/QRScanner'
import { contactsAPI } from '../api/client'
import { useTranslation } from '../contexts/TranslationContext'

export default function ScanPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  
  const [showScanner, setShowScanner] = useState(true)
  const [scannedResult, setScannedResult] = useState<{
    upiId?: string
    amount?: number
    note?: string
    name?: string
  } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifiedContact, setVerifiedContact] = useState<any>(null)

  const handleScan = async (result: any) => {
    if (result.upiId) {
      setScannedResult(result)
      setShowScanner(false)
      
      // Auto-verify the UPI ID
      setVerifying(true)
      try {
        const { data } = await contactsAPI.verifyUPI(result.upiId)
        if (data.valid) {
          setVerifiedContact({
            name: data.name,
            upi_id: data.upi_id,
            bank: data.bank,
            is_verified: data.is_verified,
            trust_score: data.trust_score || 75,
            warning: data.warning,
            is_scammer: data.is_scammer,
          })
        }
      } catch (error) {
        console.error('UPI verification failed:', error)
      } finally {
        setVerifying(false)
      }
    }
  }

  const handleProceedToPay = () => {
    if (scannedResult?.upiId) {
      const params = new URLSearchParams()
      params.set('upi', scannedResult.upiId)
      if (scannedResult.amount) params.set('amount', String(scannedResult.amount))
      if (scannedResult.note) params.set('note', scannedResult.note)
      if (verifiedContact?.name) params.set('name', verifiedContact.name)
      navigate(`/pay?${params.toString()}`)
    }
  }

  const handleNewScan = () => {
    setScannedResult(null)
    setVerifiedContact(null)
    setShowScanner(true)
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <Link 
          to="/" 
          className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            {t('scan_title', 'Scan QR Code')}
          </h1>
          <p className="text-gray-500 text-sm">{t('scan_subtitle', 'Scan to pay, send, or receive')}</p>
        </div>
        <div className="w-10" />
      </motion.div>

      {showScanner ? (
        /* Scanner View */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card"
        >
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-900">
            <QRScanner
              isOpen={true}
              onClose={() => navigate('/')}
              onScan={handleScan}
            />
            {/* Scanner Frame Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/80 rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/80 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/80 rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/80 rounded-br-xl" />
                
                {/* Scan line animation */}
                <motion.div
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent"
                />
              </div>
            </div>
            
            {/* Flashlight button */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-auto">
              <button className="p-3 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-gray-700" />
              </button>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm mb-2">{t('scan_point_camera', 'Point camera at QR code')}</p>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-1">
                <QrCode className="w-4 h-4" />
                <span>UPI QR</span>
              </div>
              <div className="flex items-center gap-1">
                <AtSign className="w-4 h-4" />
                <span>UPI ID</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Result View */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Scanned Info Card */}
          <motion.div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-primary-100 rounded-2xl">
                <QrCode className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{t('scan_code_detected', 'QR Code Detected')}</h2>
                <p className="text-sm text-gray-500">{t('scan_verified', 'Verified and ready to pay')}</p>
              </div>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('scan_upi_id', 'UPI ID')}</span>
                <span className="font-medium text-gray-900 font-mono">{scannedResult?.upiId}</span>
              </div>
              {scannedResult?.amount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('scan_amount', 'Amount')}</span>
                  <span className="font-semibold text-gray-900">₹{scannedResult.amount}</span>
                </div>
              )}
              {scannedResult?.note && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('scan_note', 'Note')}</span>
                  <span className="font-medium text-gray-900">{scannedResult.note}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Verification Result */}
          {verifying ? (
            <motion.div className="card p-5 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
              <p className="text-gray-600">{t('scan_verifying', 'Verifying recipient...')}</p>
            </motion.div>
          ) : verifiedContact ? (
            <motion.div 
              className={`card p-5 ${
                verifiedContact.is_scammer ? 'border-2 border-red-300 bg-red-50' : 
                verifiedContact.is_verified ? 'border-2 border-green-300 bg-green-50' :
                'border-2 border-yellow-300 bg-yellow-50'
              }`}
            >
              {verifiedContact.is_scammer && (
                <div className="flex items-start gap-3 mb-3 p-3 bg-red-100 rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-700">⚠️ {t('scan_fraud_alert', 'FRAUD ALERT')}</p>
                    <p className="text-sm text-red-600 mt-1">{verifiedContact.warning || t('scan_scammer_warning', 'This UPI ID has been reported for fraud. Do not send money.')}</p>
                  </div>
                </div>
              )}
              
              {!verifiedContact.is_scammer && (
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    verifiedContact.is_verified ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    {verifiedContact.is_verified ? (
                      <CheckCircle className="w-7 h-7 text-green-600" />
                    ) : (
                      <AtSign className="w-7 h-7 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{verifiedContact.name}</p>
                    <p className="text-sm text-gray-500">{verifiedContact.upi_id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{verifiedContact.bank}</span>
                      {verifiedContact.is_verified && (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          {t('scan_verified_badge', 'Verified')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                      verifiedContact.trust_score >= 80 ? 'bg-green-100 text-green-700' :
                      verifiedContact.trust_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      <Shield className="w-3 h-3 inline mr-0.5" />
                      {t('scan_trust_score', 'Trust')}: {verifiedContact.trust_score}%
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : scannedResult && !verifying && (
            <motion.div className="card p-5 text-center border-yellow-200 bg-yellow-50">
              <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
              <p className="font-medium text-yellow-800">{t('scan_could_not_verify', 'Could not verify recipient')}</p>
              <p className="text-sm text-yellow-600 mt-1">{t('scan_proceed_caution', 'Proceed with caution. Verify details manually.')}</p>
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {verifiedContact && !verifiedContact.is_scammer ? (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleProceedToPay}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4"
              >
                <ArrowLeft className="w-5 h-5" />
                {scannedResult?.amount
                  ? `${t('scan_pay_amount', 'Pay')} ₹${scannedResult.amount}`
                  : t('scan_send_money', 'Send Money')}
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleProceedToPay}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4"
                disabled={!!verifiedContact?.is_scammer}
              >
                <ArrowLeft className="w-5 h-5" />
                {scannedResult?.amount
                  ? `${t('scan_pay_amount', 'Pay')} ₹${scannedResult.amount}`
                  : t('scan_send_money', 'Send Money')}
              </motion.button>
            )}
            
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleNewScan}
              className="w-full border-2 border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <QrCode className="w-5 h-5" />
              {t('scan_again', 'Scan Another Code')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  )
}