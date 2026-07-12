import { motion, AnimatePresence } from 'framer-motion'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Shield,
  ChevronDown
} from 'lucide-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { transactionAPI } from '../api/client'
import { useAuthStore } from '../store'
import { useTranslation } from '../contexts/TranslationContext'

interface WalletTransaction {
  id: string
  type: 'credit' | 'debit'
  amount: number
  description: string
  counterparty_upi: string
  counterparty_name: string
  timestamp: string
  status: 'completed' | 'pending' | 'failed'
  risk_score?: number
  category?: string
}

export default function TransactionHistory() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'blocked'>('all')
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTransactions = useCallback(async (silent = false) => {
    if (!user?.id) return
    if (!silent) setIsLoading(true)
    try {
      const response = await transactionAPI.getHistory(1, 50)
      const txList = response.data.transactions || []
      // Map DB transaction format to our component interface
      const mapped: WalletTransaction[] = txList.map((t: any) => ({
        id: t.id,
        type: (t.type === 'credit' || t.status === 'credit') ? 'credit' : 'debit',
        amount: typeof t.amount === 'number' ? t.amount : parseFloat(t.amount),
        description: t.purpose || t.note || `Payment to ${t.recipient_upi}`,
        counterparty_upi: t.recipient_upi || '',
        counterparty_name: t.recipient_name || t.recipient_upi?.split('@')[0] || 'Unknown',
        timestamp: t.created_at || t.completed_at || new Date().toISOString(),
        status: t.status === 'blocked' ? 'failed' : t.status === 'guardian_pending' ? 'pending' : 'completed',
        risk_score: typeof t.risk_score === 'number' ? t.risk_score * 100 : 0,
        category: t.purpose || undefined,
      }))
      setTransactions(mapped)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
      if (!silent) setTransactions([])
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [user?.id])

  // Initial fetch + auto-refresh every 30 seconds
  useEffect(() => {
    fetchTransactions()
    refreshTimerRef.current = setInterval(() => fetchTransactions(true), 30000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchTransactions])

  // Calculate stats
  const stats = useMemo(() => {
    const sent = transactions.filter(t => t.type === 'debit' && t.status === 'completed')
    const received = transactions.filter(t => t.type === 'credit')
    const blocked = transactions.filter(t => t.status === 'failed')
    const savedFromScams = blocked.reduce((sum, t) => sum + t.amount, 0)
    
    return {
      sentCount: sent.length,
      sentAmount: sent.reduce((sum, t) => sum + t.amount, 0),
      receivedCount: received.length,
      receivedAmount: received.reduce((sum, t) => sum + t.amount, 0),
      blockedCount: blocked.length,
      savedAmount: savedFromScams
    }
  }, [transactions])

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    let filtered = transactions
    
    // Type filter
    if (filter === 'blocked') filtered = filtered.filter(t => t.status === 'failed')
    else if (filter === 'sent') filtered = filtered.filter(t => t.type === 'debit' && t.status !== 'failed')
    else if (filter === 'received') filtered = filtered.filter(t => t.type === 'credit')
    
    // Date filter
    const now = Date.now()
    if (dateRange === 'today') {
      filtered = filtered.filter(t => now - new Date(t.timestamp).getTime() < 86400000)
    } else if (dateRange === 'week') {
      filtered = filtered.filter(t => now - new Date(t.timestamp).getTime() < 604800000)
    } else if (dateRange === 'month') {
      filtered = filtered.filter(t => now - new Date(t.timestamp).getTime() < 2592000000)
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(t => 
        (t.counterparty_name || '').toLowerCase().includes(query) ||
        (t.counterparty_upi || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query) ||
        (t.category || '').toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [transactions, filter, dateRange, searchQuery])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success-600" />
      case 'blocked':
        return <XCircle className="w-5 h-5 text-danger-600" />
      case 'pending':
        return <Clock className="w-5 h-5 text-warning-600" />
      default:
        return null
    }
  }

  const getRiskBadge = (score: number) => {
    if (score < 30) return <span className="risk-badge-low">Safe</span>
    if (score < 60) return <span className="risk-badge-medium">Caution</span>
    if (score < 85) return <span className="risk-badge-high">Risk</span>
    return <span className="risk-badge-critical">Blocked</span>
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    // Less than 1 hour ago
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000)
      return mins <= 1 ? 'Just now' : `${mins} mins ago`
    }
    // Today
    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    }
    // Yesterday
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    }
    // This week
    if (diff < 604800000) {
      return date.toLocaleDateString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    }
    // Older
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <motion.div 
      className="space-y-5"
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
          <h1 className="text-2xl font-bold text-gray-900">{t('txn_transactions', 'Transactions')}</h1>
          <p className="text-gray-500">
            {lastUpdated 
              ? `Updated ${lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` 
              : t('txn_payment_history', 'Your payment history')}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95, rotate: 180 }}
          onClick={() => fetchTransactions()}
          className="p-3 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          disabled={isLoading}
        >
          <RefreshCw className={`w-5 h-5 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
        </motion.button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3"
      >
        <div className="card-glass bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('txn_total_sent', 'Total Sent')}</p>
              <p className="text-lg font-bold text-gray-900">₹{stats.sentAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card-glass bg-gradient-to-br from-success-50 to-emerald-50 border border-success-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('txn_total_received', 'Total Received')}</p>
              <p className="text-lg font-bold text-gray-900">₹{stats.receivedAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Saved from Scams Banner */}
      {stats.savedAmount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="card-glass bg-gradient-to-r from-success-600 to-emerald-600 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <p className="text-success-100 text-sm">{t('txn_protected_from_scams', 'Protected from scams')}</p>
              <p className="text-2xl font-bold">₹{stats.savedAmount.toLocaleString()}</p>
            </div>
            <div className="ml-auto text-right">
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                {stats.blockedCount} blocked
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('txn_search', 'Search transactions...')}
          className="input-field pl-12 pr-24"
        />
        <button
          onClick={() => setShowDateFilter(!showDateFilter)}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          {dateRange === 'all' ? 'All Time' : dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'Week' : 'Month'}
          <ChevronDown className={`w-4 h-4 transition-transform ${showDateFilter ? 'rotate-180' : ''}`} />
        </button>
      </motion.div>

      {/* Date Filter Dropdown */}
      <AnimatePresence>
        {showDateFilter && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-2 flex-wrap"
          >
            {[
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => { setDateRange(item.key as typeof dateRange); setShowDateFilter(false) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  dateRange === item.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Type Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar"
      >
        {[
          { key: 'all', label: t('txn_filter_all', 'All'), icon: Filter, count: transactions.length },
          { key: 'sent', label: t('txn_filter_sent', 'Sent'), icon: ArrowUpRight, count: stats.sentCount },
          { key: 'received', label: t('txn_filter_received', 'Received'), icon: ArrowDownLeft, count: stats.receivedCount },
          { key: 'blocked', label: t('txn_filter_blocked', 'Blocked'), icon: XCircle, count: stats.blockedCount },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key as typeof filter)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all ${
              filter === item.key
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-100'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              filter === item.key ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {item.count}
            </span>
          </button>
        ))}
      </motion.div>

      {/* Transactions List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-3"
      >
        {isLoading ? (
          <div className="card-glass text-center py-12">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Loading transactions...</p>
          </div>
        ) : filteredTransactions.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {filteredTransactions.map((transaction, index) => (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.03 }}
                layout
                className={`card-glass flex items-center gap-4 hover:shadow-lg transition-all cursor-pointer ${
                  transaction.status === 'failed' 
                    ? 'border-l-4 border-danger-500 bg-gradient-to-r from-danger-50 to-white' 
                    : 'hover:scale-[1.01]'
                }`}
              >
                {/* Direction Icon */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  transaction.status === 'failed'
                    ? 'bg-danger-100'
                    : transaction.type === 'debit' 
                      ? 'bg-gradient-to-br from-orange-100 to-red-100' 
                      : 'bg-gradient-to-br from-emerald-100 to-green-100'
                }`}>
                  {transaction.status === 'failed' ? (
                    <XCircle className="w-6 h-6 text-danger-600" />
                  ) : transaction.type === 'debit' ? (
                    <ArrowUpRight className="w-6 h-6 text-danger-600" />
                  ) : (
                    <ArrowDownLeft className="w-6 h-6 text-success-600" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {transaction.counterparty_name || 'Unknown'}
                    </h3>
                    {transaction.status === 'failed' && (
                      <span className="text-xs bg-danger-100 text-danger-600 px-2 py-0.5 rounded-full font-medium">
                        Blocked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{transaction.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatDate(transaction.timestamp)}</span>
                    {transaction.category && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-400">{transaction.category}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Amount & Status */}
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold text-lg ${
                    transaction.status === 'failed' 
                      ? 'text-gray-400 line-through' 
                      : transaction.type === 'debit' 
                        ? 'text-danger-600' 
                        : 'text-success-600'
                  }`}>
                    {transaction.type === 'debit' ? '-' : '+'}₹{transaction.amount.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1.5 justify-end mt-1">
                    {getRiskBadge(transaction.risk_score || 0)}
                    {getStatusIcon(transaction.status)}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card-glass text-center py-12"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No transactions found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
