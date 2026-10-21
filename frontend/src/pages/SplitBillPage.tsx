import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Send,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  X,
  Plus,
  Edit,
  Calculator,
  Bell,
} from 'lucide-react'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'
import ContactPicker, { Contact } from '../components/ContactPicker'

interface SplitParticipant {
  contact: Contact
  amount: number
}

interface SplitBill {
  id: string
  title: string
  totalAmount: number
  participants: SplitParticipant[]
  createdBy: string
  createdAt: string
  status: 'pending' | 'partial' | 'completed'
  paidBy: string[]
}

export default function SplitBillPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { t } = useTranslation()
  
  const [step, setStep] = useState<'create' | 'participants' | 'amounts' | 'review'>('create')
  const [splitTitle, setSplitTitle] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [participants, setParticipants] = useState<SplitParticipant[]>([])
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [savedSplits, setSavedSplits] = useState<SplitBill[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const participantTotal = participants.reduce((sum, p) => sum + p.amount, 0)
  const remainingAmount = parseFloat(totalAmount) - participantTotal
  const isAmountValid = parseFloat(totalAmount) > 0 && 
    participants.length > 0 && 
    Math.abs(remainingAmount) < 0.01

  // Load saved splits from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('upi_saved_splits')
      if (saved) {
        setSavedSplits(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load saved splits:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSplits = (splits: SplitBill[]) => {
    localStorage.setItem('upi_saved_splits', JSON.stringify(splits))
    setSavedSplits(splits)
  }

  const handleAddParticipants = (contacts: Contact[]) => {
    const newParticipants = contacts
      .filter(c => !c.is_scammer)
      .filter(c => !participants.some(p => p.contact.id === c.id))
      .map(c => ({ contact: c, amount: 0 }))
    setParticipants(prev => [...prev, ...newParticipants])
    if (newParticipants.length > 0) {
      toast.success(`Added ${newParticipants.length} participant(s)`)
    }
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index))
  }

  const handleStartEditing = (index: number) => {
    setEditingIndex(index)
    setEditAmount(String(participants[index].amount))
  }

  const handleSaveEdit = () => {
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid amount')
      return
    }
    setParticipants(prev => prev.map((p, i) => 
      i === editingIndex ? { ...p, amount } : p
    ))
    setEditingIndex(null)
    setEditAmount('')
  }

  const handleEqualSplit = () => {
    if (participants.length === 0 || !totalAmount) return
    const perPerson = Math.round((parseFloat(totalAmount) / participants.length) * 100) / 100
    const remainder = parseFloat(totalAmount) - (perPerson * participants.length)
    setParticipants(prev => prev.map((p, i) => ({
      ...p,
      amount: perPerson + (i === 0 ? remainder : 0)
    })))
    toast.success('Split equally among all participants')
  }

  const handleProportionalSplit = () => {
    // In real app, this would be based on consumption/usage
    toast('Proportional split - enter amounts manually for now')
  }

  const handleCreateSplit = async () => {
    if (!splitTitle.trim()) {
      toast.error('Enter a title for this split')
      return
    }
    if (!isAmountValid) {
      toast.error('Total amount must match sum of participant amounts')
      return
    }

    const newSplit: SplitBill = {
      id: Date.now().toString(),
      title: splitTitle,
      totalAmount: parseFloat(totalAmount),
      participants,
      createdBy: user?.id || 'user',
      createdAt: new Date().toISOString(),
      status: 'pending',
      paidBy: [],
    }

    const updated = [newSplit, ...savedSplits]
    saveSplits(updated)
    
    toast.success('Split bill created!')
    setSplitTitle('')
    setTotalAmount('')
    setParticipants([])
    setStep('create')
    navigate('/split-history')
  }

  const handleSendRequests = async (split: SplitBill) => {
    // Navigate to request money page with pre-filled data
    for (const p of split.participants) {
      if (!split.paidBy.includes(p.contact.id)) {
        const params = new URLSearchParams()
        params.set('upi', p.contact.upi_id)
        params.set('amount', String(p.amount))
        params.set('note', `${split.title} - Your share`)
        params.set('name', p.contact.name)
        // In real app: send push notification/request
        console.log('Would send request to:', p.contact.name, p.amount)
      }
    }
    toast.success(`Requests sent to ${split.participants.length - split.paidBy.length} participant(s)`)
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <Link to="/" className="p-2 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            {t('split_title', 'Split Bill')}
          </h1>
          <p className="text-gray-500 text-sm">
            {t('split_subtitle', 'Divide expenses with friends & family')}
          </p>
        </div>
        <button
          onClick={() => setShowSaved(!showSaved)}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          <Clock className="w-6 h-6" />
        </button>
      </motion.div>

      {/* Saved Splits */}
      <AnimatePresence>
        {showSaved && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t('split_history', 'Split History')}</h2>
              <button onClick={() => setShowSaved(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : savedSplits.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calculator className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>{t('split_no_history', 'No split bills yet')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {savedSplits.map((split) => (
                  <motion.div
                    key={split.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`card p-4 ${split.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{split.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        split.status === 'completed' ? 'bg-green-100 text-green-700' :
                        split.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {t(`split_status_${split.status}`, split.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                      <span>{split.participants.length} {t('split_people', 'people')}</span>
                      <span className="font-semibold text-gray-900">{formatAmount(split.totalAmount)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSendRequests(split)}
                        className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1"
                        disabled={split.status === 'completed'}
                      >
                        <Send className="w-4 h-4" />
                        {split.status === 'completed' ? t('split_completed', 'Completed') : t('split_send_requests', 'Send Requests')}
                      </button>
                      <button
                        onClick={() => {
                          const params = new URLSearchParams()
                          params.set('splitId', split.id)
                          navigate(`/split-detail?${params.toString()}`)
                        }}
                        className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-center gap-2"
      >
        {['create', 'participants', 'amounts', 'review'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              ['create', 'participants', 'amounts', 'review'].indexOf(step) >= i
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {['create', 'participants', 'amounts', 'review'].indexOf(step) > i ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div className={`w-12 h-1 rounded-full ${['create', 'participants', 'amounts', 'review'].indexOf(step) > i ? 'bg-primary-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </motion.div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* Step 1: Create Split */}
        {step === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <motion.div className="card p-6 text-center">
              <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Calculator className="w-10 h-10 text-primary-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('split_create_title', 'Create New Split')}</h2>
              <p className="text-gray-500">{t('split_create_desc', 'Split a bill, expense, or any cost with friends')}</p>
            </motion.div>

            <div className="card p-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('split_title_label', 'Split Title')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={splitTitle}
                  onChange={e => setSplitTitle(e.target.value)}
                  placeholder={t('split_title_placeholder', 'e.g., Dinner, Trip, Rent')}
                  className="input-field"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('split_total_amount', 'Total Amount')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₹</span>
                  <input
                    type="number"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="input-field pl-10 text-right text-xl font-semibold"
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setStep('participants')}
                disabled={!splitTitle.trim() || !totalAmount || parseFloat(totalAmount) <= 0}
                className="w-full btn-primary py-4 flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Users className="w-5 h-5" />
                {t('split_next', 'Next: Add Participants')}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Add Participants */}
        {step === 'participants' && (
          <motion.div
            key="participants"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">{t('split_add_people', 'Add Participants')}</h2>
                <span className="text-sm text-gray-500">{participants.length} {t('split_added', 'added')}</span>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-4">{t('split_no_participants', 'No participants added yet')}</p>
                  <button
                    onClick={() => setShowContactPicker(true)}
                    className="btn-primary flex items-center gap-2 mx-auto"
                  >
                    <Plus className="w-5 h-5" />
                    {t('split_add_people_btn', 'Add People')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {participants.map((p, index) => (
                      <motion.div
                        key={p.contact.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="font-bold text-primary-600">{p.contact.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{p.contact.name}</p>
                            <p className="text-xs text-gray-500">{p.contact.upi_id}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveParticipant(index)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setShowContactPicker(true)}
                      className="flex-1 btn-primary flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      {t('split_add_more', 'Add More')}
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setStep('amounts')}
                      className="flex-1 border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                      {t('split_next_amounts', 'Next: Set Amounts')}
                    </motion.button>
                  </div>
                </>
              )}

              <button
                onClick={() => setStep('create')}
                className="w-full mt-4 text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                ← {t('split_back', 'Back to Details')}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Set Amounts */}
        {step === 'amounts' && (
          <motion.div
            key="amounts"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">{t('split_set_amounts', 'Set Amounts')}</h2>
              
              <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t('split_total', 'Total')}</p>
                    <p className="font-bold text-xl text-gray-900">{formatAmount(parseFloat(totalAmount) || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{t('split_assigned', 'Assigned')}</p>
                    <p className={`font-bold text-xl ${Math.abs(remainingAmount) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAmount(participantTotal)}
                    </p>
                  </div>
                </div>
                {Math.abs(remainingAmount) >= 0.01 && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {remainingAmount > 0 
                      ? `${t('split_remaining', 'Remaining:')} ${formatAmount(remainingAmount)}`
                      : `${t('split_over', 'Over by:')} ${formatAmount(Math.abs(remainingAmount))}`}
                  </p>
                )}
              </div>

              {participants.map((p, index) => (
                <motion.div
                  key={p.contact.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-3 rounded-xl ${editingIndex === index ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}
                >
                  {editingIndex === index ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="font-bold text-primary-600">{p.contact.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{p.contact.name}</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          <input
                            type="number"
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                            className="input-field pl-8 text-right w-full"
                            step="0.01"
                            min="0"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => { setEditingIndex(null); setEditAmount(''); }}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="font-bold text-primary-600">{p.contact.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.contact.name}</p>
                          <p className="text-sm text-gray-500">{p.contact.upi_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold text-lg ${p.amount === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {p.amount > 0 ? formatAmount(p.amount) : t('split_not_set', 'Not set')}
                        </span>
                        <button
                          onClick={() => handleStartEditing(index)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {participants.length > 1 && (
                <div className="flex gap-3 mt-6">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleEqualSplit}
                    className="flex-1 border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <Calculator className="w-5 h-5" />
                    {t('split_equal', 'Split Equally')}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleProportionalSplit}
                    className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <Users className="w-5 h-5" />
                    {t('split_proportional', 'Proportional')}
                  </motion.button>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('participants')}
                  className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  ← {t('split_back', 'Back')}
                </button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStep('review')}
                  disabled={!isAmountValid}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                  {t('split_review', 'Review & Send')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">{t('split_review_title', 'Review Split')}</h2>
              
              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">{t('split_title_label', 'Title')}</p>
                <p className="font-semibold text-gray-900">{splitTitle || '-'}</p>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">{t('split_total_amount', 'Total Amount')}</p>
                <p className="font-bold text-xl text-gray-900">{formatAmount(parseFloat(totalAmount) || 0)}</p>
              </div>

              <div className="space-y-3">
                {participants.map((p, index) => (
                  <motion.div
                    key={p.contact.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="font-bold text-primary-600">{p.contact.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.contact.name}</p>
                        <p className="text-xs text-gray-500">{p.contact.upi_id}</p>
                      </div>
                    </div>
                    <span className="font-bold text-lg text-primary-600">{formatAmount(p.amount)}</span>
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
                <span className="font-medium text-gray-700">{t('split_total', 'Total')}</span>
                <span className="font-bold text-xl text-primary-600">{formatAmount(participantTotal)}</span>
              </div>
            </div>

            <div className="card p-5 bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-200">
              <p className="text-sm text-primary-800 mb-3 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                {t('split_review_note', 'Payment requests will be sent to all participants. They can pay via UPI SafeGuard.')}
              </p>
              <p className="text-xs text-primary-700">{t('split_you_pay', 'You can also pay your share directly from the next screen.')}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep('amounts')}
                className="w-full border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                ← {t('split_edit', 'Edit Amounts')}
              </button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleCreateSplit}
                className="w-full btn-primary py-4 flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                {t('split_create_send', 'Create Split & Send Requests')}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact Picker Modal */}
      <ContactPicker
        isOpen={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelect={() => {}} // Required by ContactPickerProps but not used in multiSelect mode
        onMultiSelectComplete={handleAddParticipants}
        multiSelect
        title={t('split_select_participants', 'Select Participants')}
        subtitle={t('split_select_multiple', 'Choose multiple people to split with')}
        selectedContacts={participants.map(p => p.contact)}
      />
    </div>
  )
}