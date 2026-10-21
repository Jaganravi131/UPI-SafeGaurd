import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Send,
  CheckCircle,
  Clock,
  ChevronRight,
  X,
  Plus,
  Edit,
  Trash2,
  Share2,
  ArrowDown,
  FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'
import ContactPicker, { Contact } from '../components/ContactPicker'

interface RequestItem {
  contact: Contact
  amount: number
  note?: string
}

interface SavedRequest {
  id: string
  title: string
  requests: RequestItem[]
  createdAt: string
  status: 'pending' | 'partial' | 'completed'
  paidBy: string[]
}

export default function RequestMoneyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const totalRequested = requests.reduce((sum, r) => sum + r.amount, 0)
  const pendingCount = requests.length

  // Load saved requests from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('upi_saved_requests')
      if (saved) {
        setSavedRequests(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load saved requests:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveRequests = (reqs: SavedRequest[]) => {
    localStorage.setItem('upi_saved_requests', JSON.stringify(reqs))
    setSavedRequests(reqs)
  }

  const handleAddContacts = (contacts: Contact[]) => {
    const newRequests = contacts
      .filter(c => !c.is_scammer)
      .filter(c => !requests.some(r => r.contact.id === c.id))
      .map(c => ({ contact: c, amount: 0, note: '' }))
    setRequests(prev => [...prev, ...newRequests])
    if (newRequests.length > 0) {
      toast.success(`Added ${newRequests.length} contact(s)`)
    }
  }

  const handleRemoveRequest = (index: number) => {
    setRequests(prev => prev.filter((_, i) => i !== index))
  }

  const handleStartEditing = (index: number) => {
    setEditingIndex(index)
    setEditAmount(String(requests[index].amount))
    setEditNote(requests[index].note || '')
  }

  const handleSaveEdit = () => {
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setRequests(prev => prev.map((r, i) => 
      i === editingIndex ? { ...r, amount, note: editNote } : r
    ))
    setEditingIndex(null)
    setEditAmount('')
    setEditNote('')
  }

  const handleSendRequests = async () => {
    if (requests.length === 0) {
      toast.error('Add at least one contact')
      return
    }
    if (requests.some(r => r.amount <= 0)) {
      toast.error('All amounts must be greater than 0')
      return
    }

    // Save to history
    const newRequest: SavedRequest = {
      id: Date.now().toString(),
      title: `Request - ${new Date().toLocaleDateString()}`,
      requests: [...requests],
      createdAt: new Date().toISOString(),
      status: 'pending',
      paidBy: [],
    }
    saveRequests([newRequest, ...savedRequests])

    // In real app: send push notifications to each contact
    for (const req of requests) {
      console.log('Would send request to:', req.contact.name, req.amount, req.note)
    }

    toast.success(`Requests sent to ${requests.length} contact(s)!`)
    setRequests([])
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  const quickAmounts = [100, 250, 500, 1000, 2000, 5000]

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
            {t('request_title', 'Request Money')}
          </h1>
          <p className="text-gray-500 text-sm">
            {t('request_subtitle', 'Request payments from contacts')}
          </p>
        </div>
        <button
          onClick={() => setShowSaved(!showSaved)}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          <Clock className="w-6 h-6" />
        </button>
      </motion.div>

      {/* Saved Requests */}
      <AnimatePresence>
        {showSaved && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t('request_history', 'Request History')}</h2>
              <button onClick={() => setShowSaved(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : savedRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>{t('request_no_history', 'No requests sent yet')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {savedRequests.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`card p-4 ${req.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{req.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        req.status === 'completed' ? 'bg-green-100 text-green-700' :
                        req.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {t(`request_status_${req.status}`, req.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                      <span>{req.requests.length} {t('request_people', 'requests')}</span>
                      <span className="font-semibold text-gray-900">{formatAmount(req.requests.reduce((s, r) => s + r.amount, 0))}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Resend requests
                          toast.success('Requests resent!')
                        }}
                        className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1"
                        disabled={req.status === 'completed'}
                      >
                        <Send className="w-4 h-4" />
                        {req.status === 'completed' ? t('request_completed', 'Completed') : t('request_resend', 'Resend')}
                      </button>
                      <button
                        onClick={() => {
                          const params = new URLSearchParams()
                          params.set('requestId', req.id)
                          navigate(`/request-detail?${params.toString()}`)
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

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Summary Card */}
        <motion.div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{t('request_new', 'New Request')}</h2>
            <span className="text-sm text-gray-500">
              {pendingCount} {t('request_pending', 'pending')} • {formatAmount(totalRequested)} {t('request_total', 'total')}
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ArrowDown className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{t('request_no_requests', 'No requests yet')}</h3>
              <p className="text-gray-500 mb-6">{t('request_add_contacts', 'Add contacts to request money from')}</p>
              <button
                onClick={() => setShowContactPicker(true)}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                {t('request_add_people', 'Add People')}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {requests.map((req, index) => (
                  <motion.div
                    key={req.contact.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-3 rounded-xl ${editingIndex === index ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}
                  >
                    {editingIndex === index ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="font-bold text-primary-600">{req.contact.name.charAt(0)}</span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{req.contact.name}</p>
                            <p className="text-xs text-gray-500">{req.contact.upi_id}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('request_amount', 'Amount')}</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                              <input
                                type="number"
                                value={editAmount}
                                onChange={e => setEditAmount(e.target.value)}
                                className="input-field pl-8 text-right"
                                step="0.01"
                                min="1"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('request_note', 'Note (Optional)')}</label>
                            <input
                              type="text"
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder={t('request_note_placeholder', 'What for?')}
                              className="input-field"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {quickAmounts.map(amt => (
                            <button
                              key={amt}
                              onClick={() => setEditAmount(String(amt))}
                              className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-all"
                              disabled={parseFloat(editAmount) === amt}
                            >
                              ₹{amt >= 1000 ? `${amt / 1000}K` : amt}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {t('request_save', 'Save')}
                          </button>
                          <button
                            onClick={() => { setEditingIndex(null); setEditAmount(''); setEditNote(''); }}
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
                            <span className="font-bold text-primary-600">{req.contact.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{req.contact.name}</p>
                            <p className="text-xs text-gray-500">{req.contact.upi_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-bold text-lg ${req.amount === 0 ? 'text-gray-400' : 'text-primary-600'}`}>
                            {req.amount > 0 ? formatAmount(req.amount) : t('request_not_set', 'Set amount')}
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleStartEditing(index)}
                              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleRemoveRequest(index)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {req.note && editingIndex !== index && (
                      <p className="text-xs text-gray-500 mt-2 ml-13">{req.note}</p>
                    )}
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="font-medium text-gray-700">{t('request_total_requested', 'Total Requested')}</span>
                <span className="font-bold text-xl text-primary-600">{formatAmount(totalRequested)}</span>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowContactPicker(true)}
                  className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  {t('request_add_more', 'Add More')}
                </button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleSendRequests}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  {t('request_send_all', 'Send All Requests')}
                </motion.button>
              </div>
            </>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div className="grid grid-cols-2 gap-4">
          <Link
            to="/split"
            className="card p-5 text-center hover-lift group border-2 border-primary-200 bg-primary-50"
          >
            <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Users className="w-7 h-7 text-primary-600" />
            </div>
            <h3 className="font-semibold text-gray-900">{t('request_split_bill', 'Split Bill')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('request_split_desc', 'Divide expenses equally')}</p>
          </Link>
          <button
            onClick={() => {
              // Generate shareable link for receiving money
              toast.success('Share link copied to clipboard!')
            }}
            className="card p-5 text-center hover-lift group"
          >
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Share2 className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">{t('request_share_upi', 'Share UPI')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('request_share_desc', 'Let others pay you easily')}</p>
          </button>
        </motion.div>
      </motion.div>

      {/* Contact Picker Modal */}
      <ContactPicker
        isOpen={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelect={() => {}} // Required by ContactPickerProps but not used in multiSelect mode
        onMultiSelectComplete={handleAddContacts}
        multiSelect
        title={t('request_select_contacts', 'Select Contacts')}
        subtitle={t('request_select_multiple', 'Choose who to request money from')}
        selectedContacts={requests.map(r => r.contact)}
      />
    </div>
  )
}