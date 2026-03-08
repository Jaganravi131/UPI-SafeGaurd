import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  AlertTriangle, 
  Upload, 
  CheckCircle,
  Phone,
  CreditCard,
  Link as LinkIcon,
  MessageSquare,
  Camera,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fraudAPI } from '../api/client'
import { useTranslation } from '../contexts/TranslationContext'

export default function FraudReport() {
  const { t } = useTranslation()
  const [step, setStep] = useState<'type' | 'details' | 'submitted'>('type')
  const [scamType, setScamType] = useState('')
  const [description, setDescription] = useState('')
  const [scammerUpi, setScammerUpi] = useState('')
  const [amountLost, setAmountLost] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])

  const scamTypes = [
    { id: 'qr_scam', label: t('fr_qr_scam', 'QR Code Scam'), icon: Camera, description: t('fr_qr_desc', 'Asked to scan QR to receive money') },
    { id: 'bank_call', label: t('fr_bank_call', 'Fake Bank Call'), icon: Phone, description: t('fr_bank_desc', 'Someone pretended to be from bank') },
    { id: 'digital_arrest', label: t('fr_digital_arrest', 'Digital Arrest'), icon: AlertTriangle, description: t('fr_digital_desc', 'Threatened with arrest over video call') },
    { id: 'remote_access', label: t('fr_remote_access', 'Remote Access'), icon: LinkIcon, description: t('fr_remote_desc', 'Asked to install AnyDesk/TeamViewer') },
    { id: 'lottery', label: t('fr_lottery', 'Lottery/Prize'), icon: CreditCard, description: t('fr_lottery_desc', 'Won a prize but asked to pay fee') },
    { id: 'other', label: t('fr_other', 'Other'), icon: MessageSquare, description: t('fr_other_desc', 'Any other type of scam') },
  ]

  const handleSubmit = async () => {
    if (!description) {
      toast.error('Please describe what happened')
      return
    }

    if (!scammerUpi) {
      toast.error('Please provide the scammer\'s UPI ID')
      return
    }

    setIsSubmitting(true)
    try {
      // Call actual API to submit fraud report
      const response = await fraudAPI.submitReport({
        scam_type: scamType,
        description: description,
        scammer_upi: scammerUpi,
        amount_lost: parseFloat(amountLost) || 0,
        has_evidence: evidenceFiles.length > 0,
        evidence_urls: evidenceFiles.map(f => f.name)
      })
      
      // Upload evidence files if any
      const reportId = response.data?.report_id || response.data?.id
      if (evidenceFiles.length > 0 && reportId) {
        try {
          await fraudAPI.uploadEvidence(reportId, evidenceFiles)
        } catch (uploadErr) {
          console.warn('Evidence upload failed (report still submitted):', uploadErr)
          toast('Report saved. Evidence upload failed - you can retry later.', { icon: '⚠️' })
        }
      }
      
      setStep('submitted')
      toast.success('Report submitted successfully! Admin will review shortly.')
    } catch (error: any) {
      console.error('Failed to submit report:', error)
      toast.error(error.response?.data?.detail || 'Failed to submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'submitted') {
    return (
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card text-center py-12"
        >
          <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('fr_report_submitted', 'Report Submitted')}</h1>
          <p className="text-gray-600 mb-6">
            {t('fr_thank_you', 'Thank you for helping protect others from this scam. Your report will be verified and added to our fraud database.')}
          </p>
          <div className="bg-primary-50 p-4 rounded-xl text-left">
            <h3 className="font-semibold text-primary-900">{t('fr_what_next', 'What happens next?')}</h3>
            <ul className="mt-2 space-y-2 text-sm text-primary-700">
              <li>• {t('fr_next_1', 'Our team verifies the report within 24 hours')}</li>
              <li>• {t('fr_next_2', 'The UPI ID will be flagged in our system')}</li>
              <li>• {t('fr_next_3', 'Others will be warned before sending money')}</li>
              <li>• {t('fr_next_4', 'You\'ll earn +100 XP for your contribution')}</li>
            </ul>
          </div>
          <button
            onClick={() => {
              setStep('type')
              setScamType('')
              setDescription('')
              setScammerUpi('')
              setAmountLost('')
              setEvidenceFiles([])
            }}
            className="btn-outline mt-6"
          >
            {t('fr_submit_another', 'Submit Another Report')}
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-gray-900">{t('fr_title', 'Report Fraud')}</h1>
        <p className="text-gray-500">{t('fr_subtitle', 'Help protect others by reporting scams')}</p>
      </motion.div>

      {/* Step 1: Select Scam Type */}
      {step === 'type' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-900">{t('fr_what_type', 'What type of scam was it?')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {scamTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setScamType(type.id)
                  setStep('details')
                }}
                className={`card text-left hover:shadow-lg transition-all p-4 ${
                  scamType === type.id ? 'ring-2 ring-primary-500' : ''
                }`}
              >
                <type.icon className="w-8 h-8 text-danger-500 mb-2" />
                <h3 className="font-semibold text-gray-900">{type.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{type.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Step 2: Details */}
      {step === 'details' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <button
            onClick={() => setStep('type')}
            className="text-primary-600 text-sm flex items-center gap-1"
          >
            ← {t('fr_change_type', 'Change scam type')}
          </button>

          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('fr_tell_us', 'Tell us what happened')}</h2>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fr_describe', 'Describe what happened')} *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us how the scam unfolded..."
                className="input-field"
                rows={4}
              />
            </div>

            {/* Scammer UPI */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fr_scammer_upi', 'Scammer\'s UPI ID (if known)')}
              </label>
              <input
                type="text"
                value={scammerUpi}
                onChange={(e) => setScammerUpi(e.target.value)}
                placeholder="example@upi"
                className="input-field"
              />
            </div>

            {/* Amount Lost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fr_amount_lost', 'Amount lost (₹)')}
              </label>
              <input
                type="number"
                value={amountLost}
                onChange={(e) => setAmountLost(e.target.value)}
                placeholder="0"
                className="input-field"
              />
            </div>

            {/* Evidence Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fr_upload_evidence', 'Upload evidence (screenshots, recordings)')}
              </label>
              <label className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-300 transition-colors cursor-pointer block">
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    setEvidenceFiles(prev => [...prev, ...files])
                  }}
                />
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Click to upload or drag and drop</p>
                <p className="text-gray-400 text-xs mt-1">PNG, JPG, PDF up to 10MB</p>
              </label>
              {evidenceFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {evidenceFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setEvidenceFiles(evidenceFiles.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 text-xs ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-danger w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  {t('fr_submit', 'Submit Report')}
                </>
              )}
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 p-4 rounded-xl">
            <h3 className="font-semibold text-blue-900">{t('fr_helps_title', 'Your report helps:')}</h3>
            <ul className="mt-2 text-sm text-blue-700 space-y-1">
              <li>• {t('fr_helps_1', 'Flag dangerous UPI IDs in our database')}</li>
              <li>• {t('fr_helps_2', 'Warn other users before they send money')}</li>
              <li>• {t('fr_helps_3', 'Train our AI to detect similar scams')}</li>
              <li>• {t('fr_helps_4', 'Support law enforcement investigations')}</li>
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  )
}
