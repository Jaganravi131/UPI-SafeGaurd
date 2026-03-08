import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Users, 
  Shield, 
  Phone, 
  CheckCircle, 
  Clock,
  UserPlus,
  Bell,
  AlertTriangle,
  Heart,
  ShieldCheck,
  UserCheck,
  X,
  Loader2,
  Trash2
} from 'lucide-react'
import { useAuthStore } from '../store'
import { guardianAPI } from '../api/client'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'

interface GuardianItem {
  id: string
  guardian_name: string
  guardian_phone: string
  relationship: string
  status: string
  created_at: string
}

interface PendingApproval {
  transaction_id: string
  ward_name?: string
  amount: number
  recipient_upi: string
  risk_level: string
  risk_score: number
  risk_factors: string[] | null
  guardian_trigger?: string | null
  guardian_trigger_detail?: string | null
  created_at: string
}

interface Ward {
  guardian_id: string
  ward_user_id: string | null
  ward_name: string
  ward_phone: string | null
  relationship: string
  status: string
  created_at: string | null
}

export default function GuardianMode() {
  const { user, updateUser } = useAuthStore()
  const { t } = useTranslation()
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [relationship, setRelationship] = useState('parent')
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [guardians, setGuardians] = useState<GuardianItem[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [myWards, setMyWards] = useState<Ward[]>([])
  const [loading, setLoading] = useState(true)

  const isGuardianEnabled = user?.guardian_enabled || guardians.length > 0

  // Fetch guardians and pending approvals on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [guardiansRes, approvalsRes, wardsRes] = await Promise.all([
        guardianAPI.list().catch(() => ({ data: [] })),
        guardianAPI.getPendingApprovals().catch(() => ({ data: [] })),
        guardianAPI.getMyWards().catch(() => ({ data: [] })),
      ])
      setGuardians(guardiansRes.data || [])
      setPendingApprovals(approvalsRes.data || [])
      setMyWards(wardsRes.data || [])
    } catch {
      // Silently handle - empty state will show
    } finally {
      setLoading(false)
    }
  }

  const handleSetupGuardian = async () => {
    if (guardianPhone.length !== 10) {
      toast.error('Please enter a valid phone number')
      return
    }
    if (guardianName.length < 2) {
      toast.error('Please enter guardian name')
      return
    }

    setIsSettingUp(true)
    try {
      await guardianAPI.setup({
        guardian_phone: guardianPhone,
        guardian_name: guardianName,
        relationship,
        approval_threshold: 5000,
      })
      updateUser({ guardian_enabled: true })
      toast.success(`Guardian request sent to ${guardianName}!`)
      setShowAddForm(false)
      setGuardianPhone('')
      setGuardianName('')
      setRelationship('parent')
      await fetchData() // Refresh list
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to setup guardian')
    } finally {
      setIsSettingUp(false)
    }
  }

  const handleRemoveGuardian = async (guardianId: string) => {
    try {
      await guardianAPI.remove(guardianId)
      toast.success('Guardian removed')
      await fetchData()
    } catch {
      toast.error('Failed to remove guardian')
    }
  }

  const handleApprove = async (transactionId: string) => {
    try {
      await guardianAPI.approve(transactionId)
      toast.success('Transaction approved ✓')
      setPendingApprovals(prev => prev.filter(a => a.transaction_id !== transactionId))
    } catch {
      toast.error('Failed to approve transaction')
    }
  }

  const handleReject = async (transactionId: string) => {
    try {
      await guardianAPI.reject(transactionId, 'Rejected by guardian')
      toast.success('Transaction blocked 🛡️')
      setPendingApprovals(prev => prev.filter(a => a.transaction_id !== transactionId))
    } catch {
      toast.error('Failed to reject transaction')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('gm_title', 'Guardian Mode')}</h1>
          <p className="text-gray-500">{t('gm_subtitle', 'Protect your family from scams')}</p>
        </div>
        <div className="p-3 bg-primary-100 rounded-2xl">
          <Heart className="w-6 h-6 text-primary-600" />
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-glass bg-gradient-to-br from-primary-600 via-primary-700 to-violet-700 text-white overflow-hidden relative"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start gap-4">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-bold text-lg">{t('gm_how_works', 'How Guardian Mode Works')}</h2>
            <p className="text-primary-100 text-sm mt-2 leading-relaxed">
              {t('gm_how_desc', 'High-risk transactions and behavioral anomalies require approval from a trusted family member before completion. Our AI behavioral model (LightGBM) detects suspicious patterns even when fraud isn\'t confirmed — triggering guardian review as a safety net. Perfect for protecting elderly parents or anyone new to digital payments.')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Guardian Status / Add Guardian */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-glass"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('gm_your_guardians', 'Your Guardians')}</h2>
          {isGuardianEnabled && (
            <span className="flex items-center gap-1.5 text-success-600 text-sm font-medium bg-success-50 px-3 py-1 rounded-full">
              <ShieldCheck className="w-4 h-4" />
              {t('gm_protected', 'Protected')}
            </span>
          )}
        </div>

        {isGuardianEnabled ? (
          <div className="space-y-3">
            {guardians.map((guardian) => (
              <div key={guardian.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {guardian.guardian_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{guardian.guardian_name}</p>
                    <p className="text-gray-500 text-sm">{guardian.relationship} • {guardian.guardian_phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className={`text-xs font-medium flex items-center gap-1 ${
                      guardian.status === 'active' ? 'text-success-600' : 'text-warning-600'
                    }`}>
                      <CheckCircle className="w-3 h-3" /> {guardian.status}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveGuardian(guardian.id)}
                    className="p-1.5 text-gray-400 hover:text-danger-500 transition-colors"
                    title="Remove guardian"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {/* Add Another Guardian */}
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full p-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                {t('gm_add_another', 'Add Another Guardian')}
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 bg-primary-50 rounded-2xl space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{t('gm_add_guardian', 'Add Guardian')}</p>
                  <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Guardian's name (e.g., Dad, Sister)"
                  className="input-field"
                />
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="input-field"
                >
                  <option value="parent">Parent</option>
                  <option value="spouse">Spouse</option>
                  <option value="sibling">Sibling</option>
                  <option value="child">Son/Daughter</option>
                  <option value="friend">Friend</option>
                  <option value="other">Other</option>
                </select>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <span className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-600">+91</span>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Phone number"
                    className="input-field pl-[4.5rem]"
                  />
                </div>
                <button
                  onClick={handleSetupGuardian}
                  disabled={isSettingUp}
                  className="btn-primary w-full"
                >
                  {isSettingUp ? t('gm_sending', 'Sending Request...') : t('gm_send_request', 'Send Request')}
                </button>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCheck className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-1">{t('gm_no_guardians', 'No guardians added yet')}</p>
              <p className="text-gray-400 text-sm">{t('gm_add_family', 'Add a family member to protect your transactions')}</p>
            </div>
            
            <div className="space-y-3">
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Guardian's name (e.g., Mom, Dad)"
                className="input-field"
              />
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="input-field"
              >
                <option value="parent">Parent</option>
                <option value="spouse">Spouse</option>
                <option value="sibling">Sibling</option>
                <option value="child">Son/Daughter</option>
                <option value="friend">Friend</option>
                <option value="other">Other</option>
              </select>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <span className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-600">+91</span>
                <input
                  type="tel"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Guardian's phone number"
                  className="input-field pl-[4.5rem]"
                />
              </div>
              <button
                onClick={handleSetupGuardian}
                disabled={isSettingUp || guardianPhone.length !== 10 || guardianName.length < 2}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                {isSettingUp ? t('gm_sending', 'Sending Request...') : t('gm_add_guardian_btn', 'Add Guardian')}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Pending Approvals */}
      {isGuardianEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card-glass"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('gm_pending', 'Pending Approvals')}</h2>
            {pendingApprovals.length > 0 && (
              <span className="bg-danger-100 text-danger-600 px-3 py-1 rounded-full text-sm font-medium animate-pulse">
                {pendingApprovals.length} waiting
              </span>
            )}
          </div>

          {pendingApprovals.length > 0 ? (
            <div className="space-y-4">
              {pendingApprovals.map((approval) => (
                <motion.div 
                  key={approval.transaction_id}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="border-2 border-warning-200 bg-gradient-to-br from-warning-50 to-orange-50 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-warning-200 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-warning-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{approval.ward_name || t('gm_payment_request', 'Payment Request')}</h3>
                        <p className="text-sm text-gray-500">{t('gm_wants_send', 'wants to send')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">₹{approval.amount.toLocaleString()}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        approval.risk_level === 'critical' ? 'bg-danger-100 text-danger-600' :
                        approval.risk_level === 'high' ? 'bg-warning-100 text-warning-600' :
                        'bg-yellow-100 text-yellow-600'
                      }`}>{approval.risk_level} risk</span>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-center gap-2 text-warning-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Risk Score: {approval.risk_score}%</span>
                    </div>
                    <p className="text-sm text-gray-600">To: {approval.recipient_upi}</p>
                    {/* LightGBM Behavioral Guardian Trigger */}
                    {approval.guardian_trigger === 'lightgbm_behavioral' && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-amber-800">Behavioral Anomaly Detected</p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            {approval.guardian_trigger_detail || 'AI behavioral model flagged this as suspicious — not confirmed fraud, but requires your review.'}
                          </p>
                        </div>
                      </div>
                    )}
                    {approval.risk_factors && approval.risk_factors.length > 0 && (
                      <p className="text-xs text-gray-500">{approval.risk_factors.join(', ')}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(approval.created_at).toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(approval.transaction_id)}
                        className="px-5 py-2.5 bg-danger-500 text-white rounded-xl font-medium hover:bg-danger-600 transition-colors shadow-lg shadow-danger-500/20"
                      >
                        Block
                      </button>
                      <button
                        onClick={() => handleApprove(approval.transaction_id)}
                        className="px-5 py-2.5 bg-success-500 text-white rounded-xl font-medium hover:bg-success-600 transition-colors shadow-lg shadow-success-500/20"
                      >
                        {t('gm_approve', 'Approve')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500">{t('gm_no_pending', 'No pending approvals')}</p>
              <p className="text-gray-400 text-sm">{t('gm_all_clear', 'All clear!')} 🎉</p>
            </div>
          )}
        </motion.div>
      )}

      {/* People I'm Guarding */}
      {myWards.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="card-glass"
        >
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('gm_people_i_guard', 'People I\'m Guarding')}</h2>
          </div>
          <div className="space-y-3">
            {myWards.map((ward) => (
              <div
                key={ward.guardian_id}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-primary-50 to-violet-50 border border-primary-100 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {ward.ward_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{ward.ward_name}</p>
                    <p className="text-gray-500 text-sm">{ward.relationship} • {ward.ward_phone || 'Phone hidden'}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                  ward.status === 'active' 
                    ? 'bg-success-100 text-success-600' 
                    : 'bg-warning-100 text-warning-600'
                }`}>
                  {ward.status}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {t('gm_guard_info', 'You\'ll receive alerts when they attempt high-risk transactions.')}
          </p>
        </motion.div>
      )}

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-glass"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('gm_benefits', 'Guardian Benefits')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Shield, text: t('gm_block_suspicious', 'Block suspicious payments'), color: 'bg-primary-100 text-primary-600' },
            { icon: Bell, text: t('gm_realtime_alerts', 'Real-time alerts'), color: 'bg-warning-100 text-warning-600' },
            { icon: Clock, text: t('gm_approval_window', '15-min approval window'), color: 'bg-blue-100 text-blue-600' },
            { icon: Users, text: t('gm_multiple_guardians', 'Multiple guardians'), color: 'bg-success-100 text-success-600' },
          ].map((item, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
            >
              <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-gray-700 text-sm font-medium">{item.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
