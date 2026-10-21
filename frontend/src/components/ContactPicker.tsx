import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  X,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Shield,
  AtSign,
  Phone,
  Plus,
  Clock,
  Star,
} from 'lucide-react'
import { useAuthStore } from '../store'
import { contactsAPI, transactionAPI } from '../api/client'
import { useTranslation } from '../contexts/TranslationContext'

export interface Contact {
  id: string
  name: string
  upi_id: string
  phone?: string
  avatar?: string
  trust_score?: number
  is_verified?: boolean
  is_favorite?: boolean
  last_transaction?: string
  source: 'recent' | 'saved' | 'search'
  is_scammer?: boolean
  warning?: string
}

interface ContactPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (contact: Contact) => void
  title?: string
  subtitle?: string
  multiSelect?: boolean
  selectedContacts?: Contact[]
  onMultiSelectComplete?: (contacts: Contact[]) => void
  hideSearch?: boolean
  hideFavorites?: boolean
}

export default function ContactPicker({
  isOpen,
  onClose,
  onSelect,
  title,
  subtitle,
  multiSelect = false,
  selectedContacts = [],
  onMultiSelectComplete,
  hideSearch = false,
  hideFavorites = false,
}: ContactPickerProps) {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  
  const [recentContacts, setRecentContacts] = useState<Contact[]>([])
  const [savedContacts, setSavedContacts] = useState<Contact[]>([])
  const [searchResults, setSearchResults] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeTab, setActiveTab] = useState<'recents' | 'saved' | 'search'>('recents')
  const [loading, setLoading] = useState(true)

  const isSelected = (contact: Contact) =>
    selectedContacts.some(c => c.id === contact.id)

  const handleSelect = (contact: Contact) => {
    if (multiSelect) {
      if (isSelected(contact)) {
        onMultiSelectComplete?.(selectedContacts.filter(c => c.id !== contact.id))
      } else {
        onMultiSelectComplete?.([...selectedContacts, contact])
      }
    } else {
      onSelect(contact)
      onClose()
    }
  }

  const fetchRecentContacts = useCallback(async () => {
    if (!user?.id) return
    try {
      const response = await transactionAPI.getHistory(1, 30)
      const transactions = response.data?.transactions || response.data || []
      
      const contactMap = new Map<string, Contact>()
      transactions.forEach((tx: any) => {
        const key = tx.recipient_upi || tx.recipient_name
        if (key && !contactMap.has(key)) {
          const trustScore = tx.trust_score || 75
          contactMap.set(key, {
            id: `recent-${key}`,
            name: tx.recipient_name || tx.recipient_upi || 'Unknown',
            upi_id: tx.recipient_upi || '',
            phone: tx.recipient_phone,
            trust_score: trustScore,
            is_verified: tx.is_verified || trustScore >= 80,
            is_favorite: false,
            last_transaction: tx.created_at,
            source: 'recent',
          })
        }
      })
      
      setRecentContacts(Array.from(contactMap.values()).slice(0, 10))
    } catch (error) {
      console.error('Failed to fetch recent contacts:', error)
    }
  }, [user?.id])

  const fetchSavedContacts = useCallback(async () => {
    if (!user?.id) return
    try {
      // In real app: fetch from backend saved contacts API
      // For now, use localStorage
      const saved = localStorage.getItem('upi_saved_contacts')
      if (saved) {
        const parsed = JSON.parse(saved)
        setSavedContacts(parsed.map((c: any) => ({
          ...c,
          id: `saved-${c.id}`,
          source: 'saved' as const,
        })))
      }
    } catch (error) {
      console.error('Failed to fetch saved contacts:', error)
    }
  }, [user?.id])

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      Promise.all([fetchRecentContacts(), fetchSavedContacts()]).finally(() => setLoading(false))
      setSearchQuery('')
      setSearchResults([])
      setActiveTab(savedContacts.length > 0 ? 'saved' : 'recents')
    }
  }, [isOpen, fetchRecentContacts, fetchSavedContacts, savedContacts.length])

  const handleSearch = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      // Search by UPI ID
      if (query.includes('@')) {
        const response = await contactsAPI.verifyUPI(query)
        if (response.data.valid) {
          setSearchResults([{
            id: `search-${query}`,
            name: response.data.name,
            upi_id: response.data.upi_id,
            trust_score: response.data.trust_score || 75,
            is_verified: response.data.is_verified,
            source: 'search',
          }])
        } else {
          setSearchResults([])
        }
      } 
      // Search by phone number
      else if (/^\d{10}$/.test(query)) {
        const response = await contactsAPI.search(query)
        if (response.data.found && response.data.contact) {
          setSearchResults([{
            id: `search-${query}`,
            name: response.data.contact.name,
            upi_id: response.data.contact.upi_id,
            phone: response.data.contact.phone,
            trust_score: response.data.contact.trust_score || 75,
            is_verified: response.data.contact.is_verified,
            source: 'search',
          }])
        } else if (response.data.scammer_alert?.is_scammer) {
          setSearchResults([{
            id: `scammer-${query}`,
            name: response.data.scammer_alert.upi_id || 'Unknown',
            upi_id: response.data.scammer_alert.upi_id || '',
            trust_score: 0,
            is_verified: false,
            source: 'search',
            is_scammer: true,
            warning: response.data.scammer_alert.warning_message,
          }])
        } else {
          setSearchResults([])
        }
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (!hideSearch && activeTab === 'search') {
        handleSearch(searchQuery)
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, activeTab, hideSearch, handleSearch])

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const getTrustBadge = (score: number) => {
    if (score >= 80) return { label: 'High Trust', color: 'bg-green-100 text-green-700', icon: CheckCircle }
    if (score >= 60) return { label: 'Medium Trust', color: 'bg-yellow-100 text-yellow-700', icon: Shield }
    return { label: 'Low Trust', color: 'bg-red-100 text-red-700', icon: AlertTriangle }
  }

  const allContacts = {
    recents: recentContacts,
    saved: savedContacts,
    search: searchResults,
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col"
        onClick={onClose}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex-1 bg-black/40 backdrop-blur-sm"
          onClick={e => e.stopPropagation()}
        />
        
        {/* Bottom Sheet */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="flex items-center justify-center pt-3">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          
          {/* Header */}
          <div className="px-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {title || t('contact_picker_title', 'Select Contact')}
                </h2>
                <p className="text-sm text-gray-500">
                  {subtitle || t('contact_picker_subtitle', 'Choose who to send money to')}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(!hideFavorites || savedContacts.length > 0) && (
                <button
                  onClick={() => setActiveTab('saved')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'saved' 
                      ? 'bg-white text-primary-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Star className="w-4 h-4 inline mr-1" />
                  {t('contact_saved', 'Saved')} 
                  {savedContacts.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary-100 text-primary-600 rounded-full">
                      {savedContacts.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveTab('recents')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'recents' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Clock className="w-4 h-4 inline mr-1" />
                {t('contact_recent', 'Recent')}
                {recentContacts.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary-100 text-primary-600 rounded-full">
                    {recentContacts.length}
                  </span>
                )}
              </button>
              {!hideSearch && (
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'search' 
                      ? 'bg-white text-primary-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Search className="w-4 h-4 inline mr-1" />
                  {t('contact_search', 'Search')}
                </button>
              )}
            </div>
          </div>
          
          {/* Search Input */}
          {activeTab === 'search' && !hideSearch && (
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('contact_search_placeholder', 'Search by name, phone, or UPI ID')}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-100 focus:border-primary-400 text-gray-900"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              {isSearching && (
                <div className="mt-2 flex items-center justify-center text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2" />
                  {t('contact_searching', 'Searching...')}
                </div>
              )}
            </div>
          )}
          
          {/* Contact List */}
          <div className="flex-1 overflow-y-auto pb-4 px-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : allContacts[activeTab].length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-40 text-center"
              >
                {activeTab === 'saved' ? (
                  <>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Star className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{t('contact_no_saved', 'No saved contacts yet')}</h3>
                    <p className="text-gray-500 mb-4">{t('contact_save_desc', 'Save contacts for faster payments')}</p>
                    <button
                      onClick={() => setActiveTab('search')}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t('contact_add_new', 'Add New Contact')}
                    </button>
                  </>
                ) : activeTab === 'recents' ? (
                  <>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{t('contact_no_recent', 'No recent contacts')}</h3>
                    <p className="text-gray-500">{t('contact_start_paying', 'Start making payments to see contacts here')}</p>
                  </>
                ) : !searchQuery ? (
                  <>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{t('contact_search_prompt', 'Search for a contact')}</h3>
                    <p className="text-gray-500">{t('contact_search_hint', 'Enter name, phone number, or UPI ID')}</p>
                  </>
                ) : isSearching ? (
                  <>
                    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-gray-500">{t('contact_searching', 'Searching...')}</p>
                  </>
                ) : searchResults.find(r => r.is_scammer) ? (
                  <>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-3">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="font-semibold text-red-700 mb-1">{t('contact_scammer_warning', '⚠️ Fraud Alert')}</h3>
                    <p className="text-red-600 px-4">{searchResults[0]?.warning || t('contact_scammer_desc', 'This contact has been reported for fraud. Do not send money.')}</p>
                  </>
                ) : searchResults.length === 0 ? (
                  <>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <AlertTriangle className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{t('contact_not_found', 'Contact not found')}</h3>
                    <p className="text-gray-500 px-4">{t('contact_try_different', 'Try a different name, phone, or UPI ID')}</p>
                  </>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                {allContacts[activeTab].map((contact, index) => (
                  <motion.div
                    key={contact.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative card p-3 group ${isSelected(contact) ? 'border-2 border-primary-500 bg-primary-50' : 'hover:bg-gray-50'}`}
                  >
                    <button
                      onClick={() => handleSelect(contact)}
                      disabled={contact.is_scammer}
                      className="w-full flex items-center gap-3 pr-8"
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        contact.is_scammer ? 'bg-red-100' :
                        contact.is_verified ? 'bg-green-100' :
                        contact.trust_score && contact.trust_score >= 80 ? 'bg-green-100' :
                        contact.trust_score && contact.trust_score >= 60 ? 'bg-yellow-100' : 'bg-gray-100'
                      }`}>
                        {contact.is_scammer ? (
                          <AlertTriangle className="w-6 h-6 text-red-500" />
                        ) : contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-lg" />
                        ) : (
                          <span className="font-bold text-lg text-gray-700">{getInitials(contact.name)}</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{contact.name}</p>
                          {contact.is_verified && (
                            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              {t('contact_verified', 'Verified')}
                            </span>
                          )}
                          {contact.is_favorite && (
                            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3 fill-current" />
                              {t('contact_favorite', 'Favorite')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                          {contact.upi_id.includes('@') ? <AtSign className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                          {contact.upi_id}
                        </p>
                        {contact.last_transaction && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {t('contact_last_txn', 'Last:')} {new Date(contact.last_transaction).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {contact.trust_score !== undefined && !contact.is_scammer && (
                          <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${getTrustBadge(contact.trust_score).color}`}>
                            {(() => {
                              const Icon = getTrustBadge(contact.trust_score).icon;
                              return <Icon className="w-2.5 h-2.5 inline mr-0.5" />;
                            })()}
                            {contact.trust_score}%
                          </span>
                        )}
                        {multiSelect ? (
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected(contact)
                              ? 'bg-primary-600 border-primary-600'
                              : 'border-gray-300'
                          }`}>
                            {isSelected(contact) && (
                              <CheckCircle className="w-4 h-4 text-white" />
                            )}
                          </div>
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 transition-colors" />
                        )}
                      </div>
                    </button>
                    
                    {contact.is_scammer && (
                      <div className="absolute bottom-0 left-0 right-0 bg-red-50 border-t border-red-200 p-2 text-center">
                        <p className="text-xs text-red-600">{t('contact_do_not_pay', 'Do not send money to this account')}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
          
          {/* Multi-select footer */}
          {multiSelect && selectedContacts.length > 0 && (
            <div className="border-t border-gray-100 p-4 flex-shrink-0 bg-white/90 backdrop-blur-sm">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  onMultiSelectComplete?.(selectedContacts)
                  onClose()
                }}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {t('contact_done', 'Done')} ({selectedContacts.length})
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}