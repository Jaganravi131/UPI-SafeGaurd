import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone,
  Tv,
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
  Zap,
  Wifi,
  Users,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'
import ContactPicker, { Contact } from '../components/ContactPicker'

// Recharge category configuration
const RECHARGE_CATEGORIES = [
  { id: 'mobile', icon: Smartphone, labelKey: 'recharge_mobile', label: 'Mobile', color: 'from-blue-400 to-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', iconBg: 'bg-blue-100', providers: ['Jio', 'Airtel', 'Vi', 'BSNL', 'MTNL'] },
  { id: 'dth', icon: Tv, labelKey: 'recharge_dth', label: 'DTH', color: 'from-purple-400 to-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', iconBg: 'bg-purple-100', providers: ['Tata Play', 'Dish TV', 'Airtel Digital TV', 'Sun Direct', 'd2h'] },
  { id: 'datacard', icon: Wifi, labelKey: 'recharge_datacard', label: 'Datacard', color: 'from-green-400 to-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', iconBg: 'bg-green-100', providers: ['JioFi', 'Airtel 4G', 'Vi MiFi', 'BSNL'] },
  { id: 'fastag', icon: CreditCard, labelKey: 'recharge_fastag', label: 'FASTag', color: 'from-orange-400 to-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', iconBg: 'bg-orange-100', providers: ['NHAI', 'ICICI', 'Axis', 'HDFC', 'SBI', 'Kotak', 'Paytm'] },
  { id: 'metro', icon: Building, labelKey: 'recharge_metro', label: 'Metro Card', color: 'from-pink-400 to-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', iconBg: 'bg-pink-100', providers: ['Delhi Metro', 'Bengaluru Metro', 'Mumbai Metro', 'Hyderabad Metro', 'Chennai Metro', 'Kochi Metro', 'Pune Metro'] },
  { id: 'electricity', icon: Zap, labelKey: 'recharge_electricity', label: 'Electricity', color: 'from-yellow-400 to-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', iconBg: 'bg-yellow-100', providers: ['BESCOM', 'KSEB', 'MSEDCL', 'TNEB', 'APEPDCL', 'Other'] },
]

// Mock saved recharge contacts
const MOCK_SAVED_RECHARGES = [
  { id: '1', categoryId: 'mobile', provider: 'Jio', number: '9876543210', nickname: 'My Jio', lastAmount: 299, lastRecharged: '2024-12-15' },
  { id: '2', categoryId: 'mobile', provider: 'Airtel', number: '8765432109', nickname: 'Mom\'s Airtel', lastAmount: 199, lastRecharged: '2024-12-10' },
  { id: '3', categoryId: 'fastag', provider: 'HDFC', number: 'FAST123456789', nickname: 'Car FASTag', lastAmount: 500, lastRecharged: '2024-12-01' },
  { id: '4', categoryId: 'dth', provider: 'Tata Play', number: '5555666677', nickname: 'Living Room TV', lastAmount: 450, lastRecharged: '2024-12-05' },
]

interface SavedRecharge {
  id: string
  categoryId: string
  provider: string
  number: string
  nickname: string
  lastAmount: number
  lastRecharged: string
}

interface RechargeFormData {
  provider: string
  number: string
  amount: string
  nickname: string
}

export default function RechargePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  
  const [selectedCategory, setSelectedCategory] = useState<typeof RECHARGE_CATEGORIES[0] | null>(null)
  const [savedRecharges, setSavedRecharges] = useState<SavedRecharge[]>(MOCK_SAVED_RECHARGES)
  const [showForm, setShowForm] = useState(false)
  const [editingRecharge, setEditingRecharge] = useState<SavedRecharge | null>(null)
  const [formData, setFormData] = useState<RechargeFormData>({
    provider: '',
    number: '',
    amount: '',
    nickname: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [popularAmounts, setPopularAmounts] = useState<number[]>([])
  const [showContactPicker, setShowContactPicker] = useState(false)
  
  const handleContactSelect = (contact: Contact) => {
    if (contact.is_scammer) {
      toast.error('🚨 This contact has been reported for fraud!')
      return
    }
    // Extract phone number from UPI ID (before @)
    const phoneNumber = contact.upi_id.split('@')[0]
    // Only use if it's a 10-digit number
    if (phoneNumber.length === 10 && /^\d{10}$/.test(phoneNumber)) {
      setFormData(prev => ({
        ...prev,
        provider: contact.name,
        number: phoneNumber,
        nickname: contact.name,
      }))
      toast.success(`Selected: ${contact.name}`)
    } else {
      toast.error('Selected contact does not have a valid phone number')
    }
    setShowContactPicker(false)
  }
  
  const categoryRecharges = savedRecharges.filter(r => !selectedCategory || r.categoryId === selectedCategory.id)

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  // Popular amounts per provider (mock data)
  const getPopularAmounts = (provider: string, _categoryId: string) => {
    const amounts: Record<string, number[]> = {
      'Jio': [199, 299, 399, 449, 599, 749, 899, 999, 1199, 1499, 2023, 2999],
      'Airtel': [179, 199, 265, 299, 359, 455, 479, 549, 699, 839, 999, 1499, 2999],
      'Vi': [199, 299, 399, 449, 599, 699, 799, 899, 1199, 1499, 2023, 2999],
      'BSNL': [107, 199, 299, 399, 499, 599, 799, 999, 1499, 1999],
      'MTNL': [199, 299, 399, 499, 599, 799, 999, 1499],
      'Tata Play': [150, 250, 350, 450, 550, 650, 750, 850, 950, 1100],
      'Dish TV': [150, 250, 350, 450, 550, 650, 750, 850],
      'Airtel Digital TV': [150, 250, 350, 450, 550, 650, 750, 850],
      'Sun Direct': [150, 250, 350, 450, 550, 650],
      'd2h': [150, 250, 350, 450, 550],
      'JioFi': [199, 299, 399, 449, 599, 749, 899, 999, 1199],
      'Airtel 4G': [199, 299, 399, 499, 599, 799, 999, 1499],
      'Vi MiFi': [199, 299, 399, 449, 599, 699, 799],
      'NHAI': [100, 200, 300, 500, 1000, 2000, 5000],
      'ICICI': [100, 200, 500, 1000, 2000, 5000],
      'Axis': [100, 200, 500, 1000, 2000, 5000],
      'HDFC': [100, 200, 500, 1000, 2000, 5000],
      'SBI': [100, 200, 500, 1000, 2000, 5000],
      'Kotak': [100, 200, 500, 1000, 2000, 5000],
      'Paytm': [100, 200, 500, 1000, 2000, 5000],
      'Delhi Metro': [100, 200, 500, 1000, 2000],
      'Bengaluru Metro': [100, 200, 500, 1000, 2000],
      'Mumbai Metro': [100, 200, 500, 1000, 2000],
      'Hyderabad Metro': [100, 200, 500, 1000, 2000],
      'Chennai Metro': [100, 200, 500, 1000, 2000],
      'BESCOM': [500, 1000, 1500, 2000, 3000, 5000],
      'KSEB': [500, 1000, 1500, 2000, 3000],
    }
    return amounts[provider] || [100, 200, 500, 1000, 2000]
  }

  const handleCategorySelect = (category: typeof RECHARGE_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setShowForm(false)
    setEditingRecharge(null)
    setPopularAmounts([])
  }

  const handleAddRecharge = (category: typeof RECHARGE_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setEditingRecharge(null)
    setFormData({ provider: '', number: '', amount: '', nickname: '' })
    setPopularAmounts([])
    setShowForm(true)
  }

  const handleEditRecharge = (recharge: SavedRecharge) => {
    setEditingRecharge(recharge)
    setFormData({
      provider: recharge.provider,
      number: recharge.number,
      amount: String(recharge.lastAmount),
      nickname: recharge.nickname,
    })
    setPopularAmounts(getPopularAmounts(recharge.provider, recharge.categoryId))
    setShowForm(true)
  }

  const handleDeleteRecharge = async (rechargeId: string) => {
    if (!confirm('Delete this saved contact?')) return
    setSavedRecharges(prev => prev.filter(r => r.id !== rechargeId))
    toast.success('Contact deleted')
  }

  const handleRecharge = async (recharge: SavedRecharge) => {
    const params = new URLSearchParams()
    params.set('upi', `${recharge.number}@recharge`)
    params.set('amount', String(recharge.lastAmount))
    params.set('note', `${recharge.provider} Recharge - ${recharge.nickname}`)
    params.set('name', recharge.provider)
    navigate(`/pay?${params.toString()}`)
  }

  const handleProviderChange = (provider: string) => {
    setFormData(prev => ({ ...prev, provider }))
    if (selectedCategory) {
      setPopularAmounts(getPopularAmounts(provider, selectedCategory.id))
    }
  }

  const handleSaveRecharge = async () => {
    if (!formData.provider || !formData.number || !formData.amount || !selectedCategory) {
      toast.error('Please fill all required fields')
      return
    }

    // Validate mobile number format for mobile category
    if (selectedCategory.id === 'mobile' && formData.number.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number')
      return
    }

    setIsLoading(true)
    try {
      await new Promise(r => setTimeout(r, 500))
      
      if (editingRecharge) {
        setSavedRecharges(prev => prev.map(r => 
          r.id === editingRecharge.id 
            ? { ...r, ...formData, lastAmount: parseFloat(formData.amount) }
            : r
        ))
        toast.success('Contact updated')
      } else {
        const newRecharge: SavedRecharge = {
          id: Date.now().toString(),
          categoryId: selectedCategory.id,
          provider: formData.provider,
          number: formData.number,
          nickname: formData.nickname || formData.provider,
          lastAmount: parseFloat(formData.amount),
          lastRecharged: new Date().toISOString().split('T')[0],
        }
        setSavedRecharges(prev => [newRecharge, ...prev])
        toast.success('Contact saved')
      }
      
      setShowForm(false)
      setEditingRecharge(null)
      setFormData({ provider: '', number: '', amount: '', nickname: '' })
      setPopularAmounts([])
    } catch {
      toast.error('Failed to save contact')
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickRecharge = async (category: typeof RECHARGE_CATEGORIES[0]) => {
    setSelectedCategory(category)
    setEditingRecharge(null)
    setFormData({ provider: '', number: '', amount: '', nickname: '' })
    setPopularAmounts([])
    setShowForm(true)
  }

  const filteredCategories = RECHARGE_CATEGORIES.filter(cat =>
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
            {t('recharge_title', 'Recharge')}
          </h1>
          <p className="text-gray-500 text-sm">{t('recharge_subtitle', 'Instant recharge for mobile, DTH & more')}</p>
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
          placeholder={t('recharge_search', 'Search providers, numbers...')}
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
            {selectedCategory ? t('recharge_categories', 'Categories') : t('recharge_all_categories', 'All Categories')}
          </h2>
          {selectedCategory && (
            <button
              onClick={() => { setSelectedCategory(null); }}
              className="text-sm text-primary-600 font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('recharge_back', 'Back')}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-3">
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

      {/* Quick Recharge for selected category (no saved contacts) */}
      {selectedCategory && categoryRecharges.length === 0 && (
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
              <p className="text-sm text-gray-500">{t('recharge_no_saved', 'No saved contacts yet')}</p>
            </div>
          </div>
          <button
            onClick={() => handleQuickRecharge(selectedCategory)}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            {t('recharge_quick', 'Quick Recharge')}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            {t('recharge_one_time', 'One-time recharge without saving')}
          </p>
        </motion.div>
      )}

      {/* Saved Recharges List */}
      {categoryRecharges.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedCategory 
                ? `${t(selectedCategory.labelKey, selectedCategory.label)} ${t('recharge_contacts', 'Contacts')}`
                : t('recharge_saved_contacts', 'Saved Contacts')
              }
            </h2>
            <button
              onClick={() => handleAddRecharge(selectedCategory || RECHARGE_CATEGORIES[0])}
              className="p-2 bg-primary-50 text-primary-600 rounded-xl hover:bg-primary-100 transition-colors"
            >
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3">
            {categoryRecharges.map((recharge, index) => (
              <motion.div
                key={recharge.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="card p-4 hover-lift"
              >
                <button
                  onClick={() => handleRecharge(recharge)}
                  className="w-full flex items-center gap-3 pr-8 relative"
                >
                  <div className={`${recharge.categoryId === 'mobile' ? 'bg-blue-100' : 
                    recharge.categoryId === 'dth' ? 'bg-purple-100' :
                    recharge.categoryId === 'datacard' ? 'bg-green-100' :
                    recharge.categoryId === 'fastag' ? 'bg-orange-100' :
                    recharge.categoryId === 'metro' ? 'bg-pink-100' : 'bg-yellow-100'
                  } w-12 h-12 rounded-xl flex items-center justify-center`}>
                    {/* @ts-ignore */}
                    {RECHARGE_CATEGORIES.find(c => c.id === recharge.categoryId)?.icon || Smartphone}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 truncate">{recharge.nickname}</p>
                      <span className="text-lg font-bold text-gray-900">{formatAmount(recharge.lastAmount)}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{recharge.provider} • {recharge.number.slice(-4)}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t('recharge_last', 'Last recharged:')} {new Date(recharge.lastRecharged).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
                {/* Edit/Delete menu */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ position: 'relative' }}>
                  <button
                    onClick={e => { e.stopPropagation(); handleEditRecharge(recharge); }}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteRecharge(recharge.id); }}
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

      {/* Add/Edit Recharge Form */}
      <AnimatePresence>
        {showForm && selectedCategory && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 flex items-end pb-0"
            onClick={() => { setShowForm(false); setEditingRecharge(null); }}
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
                        {editingRecharge ? t('recharge_edit_contact', 'Edit Contact') : t('recharge_add_contact', 'Add Contact')}
                      </h3>
                      <p className="text-sm text-gray-500">{t(selectedCategory.labelKey, selectedCategory.label)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); setEditingRecharge(null); }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('recharge_provider', 'Provider')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.provider}
                      onChange={e => handleProviderChange(e.target.value)}
                      className="w-full input-field appearance-none bg-white"
                    >
                      <option value="">{t('recharge_select_provider', 'Select provider')}</option>
                      {selectedCategory.providers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    {selectedCategory.id === 'mobile' && (
                      <button
                        type="button"
                        onClick={() => setShowContactPicker(true)}
                        className="w-full mt-2 border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <Users className="w-5 h-5" />
                        <Plus className="w-4 h-4" />
                        {t('recharge_from_contacts', 'Select from Contacts')}
                      </button>
                    )}
                  </div>

                  {/* Number/ID */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedCategory.id === 'mobile' ? t('recharge_mobile_number', 'Mobile Number') :
                       selectedCategory.id === 'fastag' ? t('recharge_fastag_id', 'FASTag ID') :
                       selectedCategory.id === 'metro' ? t('recharge_metro_card', 'Metro Card Number') :
                       t('recharge_account_number', 'Account/Customer ID')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={selectedCategory.id === 'mobile' ? 'tel' : 'text'}
                      value={formData.number}
                      onChange={e => setFormData({ ...formData, number: e.target.value.replace(/\D/g, '').slice(0, selectedCategory.id === 'mobile' ? 10 : 20) })}
                      placeholder={selectedCategory.id === 'mobile' ? 'Enter 10-digit mobile number' : 'Enter account/customer ID'}
                      className="input-field"
                      maxLength={selectedCategory.id === 'mobile' ? 10 : 20}
                    />
                  </div>

                  {/* Nickname */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('recharge_nickname', 'Nickname (Optional)')}
                    </label>
                    <input
                      type="text"
                      value={formData.nickname}
                      onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                      placeholder={t('recharge_nickname_placeholder', 'e.g., My Jio, Mom\'s Phone')}
                      className="input-field"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('recharge_amount', 'Amount')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₹</span>
                      <input
                        type="number"
                        value={formData.amount}
                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0"
                        className="input-field pl-10 text-right"
                        min="10"
                        step="1"
                      />
                    </div>
                  </div>

                  {/* Popular Amounts */}
                  {formData.provider && popularAmounts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('recharge_popular', 'Popular Amounts')}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {popularAmounts.slice(0, 8).map(amount => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setFormData({ ...formData, amount: String(amount) })}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                              formData.amount === String(amount)
                                ? 'bg-primary-100 border-primary-300 text-primary-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                            }`}
                          >
                            ₹{amount >= 1000 ? `${amount / 1000}K` : amount}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save Button */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleSaveRecharge}
                    disabled={isLoading}
                    className="w-full btn-primary py-4 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        {t('recharge_saving', 'Saving...')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        {editingRecharge ? t('recharge_update', 'Update Contact') : t('recharge_save', 'Save & Recharge')}
                      </>
                    )}
                  </motion.button>

                  {/* Recharge directly without saving */}
                  {!editingRecharge && formData.number && formData.amount && (
                    <button
                      onClick={() => {
                        const params = new URLSearchParams()
                        params.set('upi', `${formData.number}@recharge`)
                        params.set('amount', formData.amount)
                        params.set('note', `${formData.provider} Recharge - ${formData.nickname || 'Recharge'}`)
                        params.set('name', formData.provider)
                        navigate(`/pay?${params.toString()}`)
                        setShowForm(false)
                      }}
                      className="w-full border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Zap className="w-5 h-5" />
                      {t('recharge_pay_once', 'Recharge Once (Don\'t Save)')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!selectedCategory && categoryRecharges.length === 0 && searchQuery === '' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-8 text-center"
        >
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('recharge_no_contacts_title', 'No Saved Contacts')}</h3>
          <p className="text-gray-500 mb-6">{t('recharge_no_contacts_desc', 'Save contacts for faster recharges next time')}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => handleAddRecharge(RECHARGE_CATEGORIES[0])}
              className="btn-primary flex items-center gap-2"
            >
              <ArrowUpRight className="w-5 h-5" />
              {t('recharge_add_first', 'Add First Contact')}
            </button>
            <button
              onClick={() => handleCategorySelect(RECHARGE_CATEGORIES[0])}
              className="border-2 border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-600 py-3 px-6 rounded-xl font-semibold flex items-center gap-2 transition-all"
            >
              <Zap className="w-5 h-5" />
              {t('recharge_quick', 'Quick Recharge')}
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
        title={t('recharge_select_contact', 'Select Contact')}
        subtitle={t('recharge_select_contact_subtitle', 'Choose a contact to add for recharge')}
      />
    </div>
  )
}