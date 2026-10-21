import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Wifi,
  Fuel,
  Home,
  Tv,
  Shield,
  CreditCard,
  ArrowLeft,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  Building,
  FileText,
  RefreshCw,
  ArrowUpRight,
  Users,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'
import ContactPicker, { Contact } from '../components/ContactPicker'

// Bill category configuration
const BILL_CATEGORIES = [
  { id: 'electricity', icon: Zap, labelKey: 'bills_electricity', label: 'Electricity', color: 'from-yellow-400 to-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', iconBg: 'bg-yellow-100', providers: ['BESCOM', 'KSEB', 'MSEDCL', 'TNEB', 'APEPDCL', 'Other'] },
  { id: 'water', icon: Wifi, labelKey: 'bills_water', label: 'Water', color: 'from-blue-400 to-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', iconBg: 'bg-blue-100', providers: ['BWSSB', 'KWA', 'MCGM', 'DJB', 'CMWSSB', 'Other'] },
  { id: 'gas', icon: Fuel, labelKey: 'bills_gas', label: 'Piped Gas', color: 'from-orange-400 to-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', iconBg: 'bg-orange-100', providers: ['IGL', 'MGL', 'GGL', 'AGL', 'Other'] },
  { id: 'broadband', icon: Home, labelKey: 'bills_broadband', label: 'Broadband', color: 'from-purple-400 to-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', iconBg: 'bg-purple-100', providers: ['Airtel Xstream', 'JioFiber', 'ACT Fibernet', 'Hathway', 'BSNL', 'Other'] },
  { id: 'dth', icon: Tv, labelKey: 'bills_dth', label: 'DTH Recharge', color: 'from-pink-400 to-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', iconBg: 'bg-pink-100', providers: ['Tata Play', 'Dish TV', 'Airtel Digital TV', 'Sun Direct', 'Other'] },
  { id: 'insurance', icon: Shield, labelKey: 'bills_insurance', label: 'Insurance', color: 'from-green-400 to-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', iconBg: 'bg-green-100', providers: ['LIC', 'HDFC Life', 'ICICI Prudential', 'SBI Life', 'Max Life', 'Other'] },
  { id: 'credit_card', icon: CreditCard, labelKey: 'bills_credit_card', label: 'Credit Card', color: 'from-indigo-400 to-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100', providers: ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'Amex', 'Other'] },
  { id: 'loan', icon: Building, labelKey: 'bills_loan', label: 'Loan EMI', color: 'from-teal-400 to-teal-500', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', iconBg: 'bg-teal-100', providers: ['HDFC', 'SBI', 'ICICI', 'Axis', 'Bajaj Finserv', 'Other'] },
]

// Mock saved billers (in real app, this would come from backend)
const MOCK_SAVED_BILLERS = [
  { id: '1', categoryId: 'electricity', provider: 'BESCOM', accountNumber: '1234567890', nickname: 'Home Electricity', lastAmount: 2340, lastPaid: '2024-12-15' },
  { id: '2', categoryId: 'broadband', provider: 'Airtel Xstream', accountNumber: '9876543210', nickname: 'Home WiFi', lastAmount: 999, lastPaid: '2024-12-10' },
  { id: '3', categoryId: 'dth', provider: 'Tata Play', accountNumber: '5555666677', nickname: 'Living Room TV', lastAmount: 450, lastPaid: '2024-12-01' },
]

interface SavedBiller {
  id: string
  categoryId: string
  provider: string
  accountNumber: string
  nickname: string
  lastAmount: number
  lastPaid: string
}

interface BillFormData {
  provider: string
  accountNumber: string
  amount: string
  nickname: string
}

export default function BillsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useTranslation()
  
  const [selectedCategory, setSelectedCategory] = useState<typeof BILL_CATEGORIES[0] | null>(null)
  const [savedBillers, setSavedBillers] = useState<SavedBiller[]>(MOCK_SAVED_BILLERS)
  const [showForm, setShowForm] = useState(false)
  const [editingBiller, setEditingBiller] = useState<SavedBiller | null>(null)
  const [formData, setFormData] = useState<BillFormData>({
    provider: '',
    accountNumber: '',
    amount: '',
    nickname: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showContactPicker, setShowContactPicker] = useState(false)
  
  const handleContactSelect = (contact: Contact) => {
    if (contact.is_scammer) {
      toast.error('🚨 This contact has been reported for fraud!')
      return
    }
    // Extract username from UPI ID (before @)
    const upiUsername = contact.upi_id.split('@')[0]
    setFormData(prev => ({
      ...prev,
      provider: contact.name,
      accountNumber: upiUsername,
      nickname: contact.name,
    }))
    toast.success(`Selected: ${contact.name}`)
    setShowContactPicker(false)
  }
  
  // Get category from URL param
  useEffect(() => {
    const categoryId = searchParams.get('category')
    if (categoryId) {
      const cat = BILL_CATEGORIES.find(c => c.id === categoryId)
      if (cat) setSelectedCategory(cat)
    }
  }, [searchParams])

  const categoryBillers = savedBillers.filter(b => !selectedCategory || b.categoryId === selectedCategory.id)

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  const handleCategorySelect = (category: typeof BILL_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setSearchParams({ category: category.id })
    setShowForm(false)
    setEditingBiller(null)
  }

  const handleAddBiller = (category: typeof BILL_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setSearchParams({ category: category.id })
    setEditingBiller(null)
    setFormData({ provider: '', accountNumber: '', amount: '', nickname: '' })
    setShowForm(true)
  }

  const handleEditBiller = (biller: SavedBiller) => {
    setEditingBiller(biller)
    setFormData({
      provider: biller.provider,
      accountNumber: biller.accountNumber,
      amount: String(biller.lastAmount),
      nickname: biller.nickname,
    })
    setShowForm(true)
  }

  const handleDeleteBiller = async (billerId: string) => {
    if (!confirm('Delete this saved biller?')) return
    setSavedBillers(prev => prev.filter(b => b.id !== billerId))
    toast.success('Biller deleted')
  }

  const handlePayBill = async (biller: SavedBiller) => {
    // Navigate to payment flow with pre-filled data
    const params = new URLSearchParams()
    params.set('upi', `${biller.accountNumber}@billpay`)
    params.set('amount', String(biller.lastAmount))
    params.set('note', `${biller.provider} - ${biller.nickname}`)
    params.set('name', biller.provider)
    navigate(`/pay?${params.toString()}`)
  }

  const handleSaveBiller = async () => {
    if (!formData.provider || !formData.accountNumber || !formData.amount || !selectedCategory) {
      toast.error('Please fill all required fields')
      return
    }

    setIsLoading(true)
    try {
      // In real app: await billAPI.saveBiller(...)
      await new Promise(r => setTimeout(r, 500))
      
      if (editingBiller) {
        setSavedBillers(prev => prev.map(b => 
          b.id === editingBiller.id 
            ? { ...b, ...formData, lastAmount: parseFloat(formData.amount) }
            : b
        ))
        toast.success('Biller updated')
      } else {
        const newBiller: SavedBiller = {
          id: Date.now().toString(),
          categoryId: selectedCategory.id,
          provider: formData.provider,
          accountNumber: formData.accountNumber,
          nickname: formData.nickname || formData.provider,
          lastAmount: parseFloat(formData.amount),
          lastPaid: new Date().toISOString().split('T')[0],
        }
        setSavedBillers(prev => [newBiller, ...prev])
        toast.success('Biller saved')
      }
      
      setShowForm(false)
      setEditingBiller(null)
      setFormData({ provider: '', accountNumber: '', amount: '', nickname: '' })
    } catch {
      toast.error('Failed to save biller')
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickPay = async (category: typeof BILL_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setSearchParams({ category: category.id })
    setEditingBiller(null)
    setFormData({ provider: '', accountNumber: '', amount: '', nickname: '' })
    setShowForm(true)
  }

  const filteredCategories = BILL_CATEGORIES.filter(cat =>
    cat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.providers.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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
            {t('bills_title', 'Pay Bills')}
          </h1>
          <p className="text-gray-500 text-sm">{t('bills_subtitle', 'Pay all your bills in one place')}</p>
        </div>
        <div className="w-10" />
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('bills_search', 'Search bills, providers...')}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-100 focus:border-primary-400 text-gray-900"
        />
      </motion.div>

      {/* Categories Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedCategory ? t('bills_categories', 'Categories') : t('bills_all_categories', 'All Categories')}
          </h2>
          {selectedCategory && (
            <button
              onClick={() => { setSelectedCategory(null); setSearchParams({}); }}
              className="text-sm text-primary-600 font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('bills_back', 'Back')}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          {filteredCategories.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                onClick={() => handleCategorySelect(category)}
                className={`card relative p-4 text-center group ${selectedCategory?.id === category.id ? 'border-2 border-primary-500 shadow-lg shadow-primary-500/10' : 'border-gray-100 hover:border-primary-200'}`}
              >
                <div className={`${category.iconBg} w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform ${category.color}`}>
                  <category.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors">
                  {t(category.labelKey, category.label)}
                </span>
                {selectedCategory?.id === category.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary-500 rounded-full" />
                )}
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Quick Pay for selected category (no saved billers) */}
      {selectedCategory && categoryBillers.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`${selectedCategory.iconBg} p-3 rounded-2xl ${selectedCategory.color}`}>
              <selectedCategory.icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t(selectedCategory.labelKey, selectedCategory.label)}</h3>
              <p className="text-sm text-gray-500">{t('bills_no_saved', 'No saved billers yet')}</p>
            </div>
          </div>
          <button
            onClick={() => handleQuickPay(selectedCategory)}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            {t('bills_quick_pay', 'Quick Pay')}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            {t('bills_one_time', 'One-time payment without saving')}
          </p>
        </motion.div>
      )}

      {/* Saved Billers List */}
      {categoryBillers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedCategory 
                ? `${t(selectedCategory.labelKey, selectedCategory.label)} ${t('bills_billers', 'Billers')}`
                : t('bills_saved_billers', 'Saved Billers')
              }
            </h2>
            <button
              onClick={() => handleAddBiller(selectedCategory || BILL_CATEGORIES[0])}
              className="p-2 bg-primary-50 text-primary-600 rounded-xl hover:bg-primary-100 transition-colors"
            >
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3">
            {categoryBillers.map((biller, index) => (
              <motion.div
                key={biller.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="card p-4 hover-lift"
              >
                <button
                  onClick={() => handlePayBill(biller)}
                  className="w-full flex items-center gap-3 pr-8 relative"
                >
                  <div className={`${biller.categoryId === 'electricity' ? 'bg-yellow-100' : 
                    biller.categoryId === 'water' ? 'bg-blue-100' :
                    biller.categoryId === 'gas' ? 'bg-orange-100' :
                    biller.categoryId === 'broadband' ? 'bg-purple-100' :
                    biller.categoryId === 'dth' ? 'bg-pink-100' :
                    biller.categoryId === 'insurance' ? 'bg-green-100' :
                    biller.categoryId === 'credit_card' ? 'bg-indigo-100' : 'bg-teal-100'
                  } w-12 h-12 rounded-xl flex items-center justify-center`}>
                    {/* @ts-ignore */}
                    {BILL_CATEGORIES.find(c => c.id === biller.categoryId)?.icon || FileText}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 truncate">{biller.nickname}</p>
                      <span className="text-lg font-bold text-gray-900">{formatAmount(biller.lastAmount)}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{biller.provider} • {biller.accountNumber.slice(-4)}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t('bills_last_paid', 'Last paid:')} {new Date(biller.lastPaid).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
                {/* Edit/Delete menu */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ position: 'relative' }}>
                  <button
                    onClick={e => { e.stopPropagation(); handleEditBiller(biller); }}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteBiller(biller.id); }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Add/Edit Biller Form */}
      <AnimatePresence>
        {showForm && selectedCategory && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 flex items-end pb-0"
            onClick={() => { setShowForm(false); setEditingBiller(null); }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full bg-black/50"
              onClick={e => e.stopPropagation()}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
              
              <div className="px-6 pb-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`${selectedCategory.iconBg} p-3 rounded-2xl ${selectedCategory.color}`}>
                      <selectedCategory.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {editingBiller ? t('bills_edit_biller', 'Edit Biller') : t('bills_add_biller', 'Add Biller')}
                      </h3>
                      <p className="text-sm text-gray-500">{t(selectedCategory.labelKey, selectedCategory.label)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); setEditingBiller(null); }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('bills_provider', 'Service Provider')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.provider}
                      onChange={e => setFormData({ ...formData, provider: e.target.value })}
                      className="w-full input-field appearance-none bg-white"
                    >
                      <option value="">{t('bills_select_provider', 'Select provider')}</option>
                      {selectedCategory.providers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowContactPicker(true)}
                      className="w-full mt-2 border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Users className="w-5 h-5" />
                      <Plus className="w-4 h-4" />
                      {t('bills_from_contacts', 'Select from Contacts')}
                    </button>
                  </div>

                  {/* Account Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('bills_account_number', 'Account/Customer ID')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder={t('bills_account_placeholder', 'Enter account/customer ID')}
                      className="input-field"
                    />
                  </div>

                  {/* Nickname */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('bills_nickname', 'Nickname (Optional)')}
                    </label>
                    <input
                      type="text"
                      value={formData.nickname}
                      onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                      placeholder={t('bills_nickname_placeholder', 'e.g., Home Electricity')}
                      className="input-field"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('bills_amount', 'Amount')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₹</span>
                      <input
                        type="number"
                        value={formData.amount}
                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0"
                        className="input-field pl-10 text-right"
                        min="1"
                        step="1"
                      />
                    </div>
                  </div>

                  {/* Save Button */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleSaveBiller}
                    disabled={isLoading}
                    className="w-full btn-primary py-4 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        {t('bills_saving', 'Saving...')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        {editingBiller ? t('bills_update', 'Update Biller') : t('bills_save', 'Save & Pay')}
                      </>
                    )}
                  </motion.button>

                  {/* Pay directly without saving */}
                  {!editingBiller && formData.accountNumber && formData.amount && (
                    <button
                      onClick={() => {
                        const params = new URLSearchParams()
                        params.set('upi', `${formData.accountNumber}@billpay`)
                        params.set('amount', formData.amount)
                        params.set('note', `${formData.provider} - ${formData.nickname || 'Bill Payment'}`)
                        params.set('name', formData.provider)
                        navigate(`/pay?${params.toString()}`)
                        setShowForm(false)
                      }}
                      className="w-full border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Zap className="w-5 h-5" />
                      {t('bills_pay_once', 'Pay Once (Don\'t Save)')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State - No categories selected */}
      {!selectedCategory && categoryBillers.length === 0 && searchQuery === '' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-8 text-center"
        >
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('bills_no_billers_title', 'No Saved Billers')}</h3>
          <p className="text-gray-500 mb-6">{t('bills_no_billers_desc', 'Save your billers for faster payments next time')}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => handleAddBiller(BILL_CATEGORIES[0])}
              className="btn-primary flex items-center gap-2"
            >
              <ArrowUpRight className="w-5 h-5" />
              {t('bills_add_first', 'Add First Biller')}
            </button>
            <button
              onClick={() => handleCategorySelect(BILL_CATEGORIES[0])}
              className="border-2 border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-600 py-3 px-6 rounded-xl font-semibold flex items-center gap-2 transition-all"
            >
              <Zap className="w-5 h-5" />
              {t('bills_quick_pay', 'Quick Pay')}
            </button>
          </div>
        </motion.div>
      )}
    
      {/* Contact Picker Modal */}
      <ContactPicker
        isOpen={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelect={handleContactSelect}
        onMultiSelectComplete={() => {}}
        multiSelect={false}
        title={t('bills_select_contact', 'Select Contact')}
        subtitle={t('bills_select_contact_subtitle', 'Choose a contact to add as biller')}
      />
    </div>
  )
}