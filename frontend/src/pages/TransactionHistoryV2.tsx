import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Shield,
  ChevronDown,
  Download,
  Share2,
  AlertTriangle,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { transactionAPI } from '../api/client'
import { useAuthStore } from '../store'
import { useTranslation } from '../contexts/TranslationContext'
import { generateNCRPReport } from '../utils/generateNCRPReport'

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
  risk_factors?: string[]
  risk_level?: string
  guardian_approval_required?: boolean
  is_blocked?: boolean
}

interface GroupedTransactions {
  date: string
  displayDate: string
  transactions: WalletTransaction[]
  dayTotal: { sent: number; received: number }
}

export default function TransactionHistoryV2() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  
  // State
  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'blocked'>('all')
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pullStartRef = useRef<number>(0)
  const isPullingRef = useRef(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Fetch transactions with pagination
  const fetchTransactions = useCallback(async (pageNum = 1, silent = false) => {
    if (!user?.id) return
    if (!silent && pageNum === 1) setIsLoading(true)
    if (pageNum > 1) setIsLoadingMore(true)
    if (pageNum === 1 && isRefreshing) setIsRefreshing(true)

    try {
      const response = await transactionAPI.getHistory(pageNum, 20)
      const txList = response.data.transactions || []
      
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
        risk_factors: t.risk_factors || [],
        risk_level: t.risk_level,
        guardian_approval_required: t.guardian_approval_required,
        is_blocked: t.status === 'blocked',
      }))

      if (pageNum === 1) {
        setTransactions(mapped)
      } else {
        setTransactions(prev => [...prev, ...mapped])
      }
      
      setHasMore(mapped.length === 20)
      setPage(pageNum)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
      if (pageNum === 1 && !silent) setTransactions([])
    } finally {
      if (pageNum === 1) {
        setIsLoading(false)
        setIsRefreshing(false)
      } else {
        setIsLoadingMore(false)
      }
    }
  }, [user?.id, isRefreshing])

  // Initial fetch + auto-refresh every 30 seconds
  useEffect(() => {
    fetchTransactions()
    refreshTimerRef.current = setInterval(() => fetchTransactions(1, true), 30000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchTransactions])

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPage(1)
    }, 300)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery])

  // Load more on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (isLoadingMore || !hasMore || isLoading) return
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        fetchTransactions(page + 1, true)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [fetchTransactions, page, hasMore, isLoadingMore, isLoading])

  // Pull to refresh gesture
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        pullStartRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current) return
      const pullDistance = e.touches[0].clientY - pullStartRef.current
      if (pullDistance > 100 && !isRefreshing) {
        isPullingRef.current = false
        fetchTransactions(1, false)
      }
    }

    const handleTouchEnd = () => {
      isPullingRef.current = false
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [fetchTransactions, isRefreshing])

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

  // Group transactions by date
  const groupedTransactions = useMemo((): GroupedTransactions[] => {
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
    
    // Group by date
    const groups = new Map<string, WalletTransaction[]>()
    filtered.forEach(t => {
      const dateKey = new Date(t.timestamp).toDateString()
      if (!groups.has(dateKey)) groups.set(dateKey, [])
      groups.get(dateKey)!.push(t)
    })
    
    // Sort groups by date (newest first)
    return Array.from(groups.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .map(([date, txns]) => {
        const dayTotal = txns.reduce((acc, t) => {
          if (t.type === 'debit' && t.status === 'completed') acc.sent += t.amount
          if (t.type === 'credit') acc.received += t.amount
          return acc
        }, { sent: 0, received: 0 })
        
        const dateObj = new Date(date)
        const now = new Date()
        let displayDate = ''
        if (dateObj.toDateString() === now.toDateString()) {
          displayDate = t('txn_today', 'Today')
        } else {
          const yesterday = new Date(now)
          yesterday.setDate(yesterday.getDate() - 1)
          if (dateObj.toDateString() === yesterday.toDateString()) {
            displayDate = t('txn_yesterday', 'Yesterday')
          } else {
            displayDate = dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
          }
        }
        
        return { date, displayDate, transactions: txns, dayTotal }
      })
  }, [transactions, filter, dateRange, searchQuery])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-success-600" />
      case 'failed': return <XCircle className="w-5 h-5 text-danger-600" />
      case 'pending': return <Clock className="w-5 h-5 text-warning-600" />
      default: return null
    }
  }

  const getRiskBadge = (score: number) => {
    if (score < 30) return <span className="risk-badge-low">{t('txn_risk_safe', 'Safe')}</span>
    if (score < 60) return <span className="risk-badge-medium">{t('txn_risk_caution', 'Caution')}</span>
    if (score < 85) return <span className="risk-badge-high">{t('txn_risk_risky', 'Risky')}</span>
    return <span className="risk-badge-critical">{t('txn_risk_blocked', 'Blocked')}</span>
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000)
      return mins <= 1 ? t('txn_just_now', 'Just now') : `${mins} ${t('txn_mins_ago', 'mins ago')}`
    }
    if (date.toDateString() === now.toDateString()) {
      return `${t('txn_today', 'Today')}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    }
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `${t('txn_yesterday', 'Yesterday')}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    }
    if (diff < 604800000) {
      return date.toLocaleDateString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)

  const handleExportPDF = (txn: WalletTransaction) => {
    generateNCRPReport({
      victimName: user?.full_name || 'Unknown',
      victimUPI: user?.upi_id || '',
      victimPhone: user?.phone_number || '',
      attackerUPI: txn.counterparty_upi,
      attackerName: txn.counterparty_name,
      attackerBank: '',
      amount: txn.amount,
      note: txn.description,
      timestamp: new Date(txn.timestamp),
      securityAnalysis: {
        risk_level: txn.risk_level || 'unknown',
        risk_level_label: txn.risk_level || 'unknown',
        final_score: txn.risk_score || 0,
        primary_reason: txn.risk_factors?.[0] || '',
        all_reasons: txn.risk_factors || [],
        safety_tips: ['Verify recipient before sending money', 'Report suspicious activity'],
        layer_summary: [],
        is_blocked: txn.is_blocked || false,
        can_proceed: !txn.is_blocked,
        scam_type_detected: null,
        scam_type_label: null,
        transaction_id: txn.id,
      },
      layerResults: [],
      sensorData: {
        gyroscope: { x: 0, y: 0, z: 0 },
        accelerometer: { x: 0, y: 0, z: 0 },
        touch_pressure: 0.5,
        typing_speed: 0,
      },
      isOnCall: false,
      scammerReportCount: 0,
      scammerWarning: '',
    })
    toast.success('Cyber Crime Report downloaded!')
  }

  const handleShareTransaction = async (txn: WalletTransaction) => {
    const shareData = {
      title: 'Transaction Details',
      text: `${txn.counterparty_name} - ${formatAmount(txn.amount)} - ${formatDate(txn.timestamp)}`,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Fallback to clipboard
          await navigator.clipboard.writeText(shareData.text)
          toast.success('Copied to clipboard!')
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.text)
      toast.success('Copied to clipboard!')
    }
  }

  return (
    <motion.div 
      className="space-y-5 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Pull to Refresh Indicator */}
      {isRefreshing && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl shadow-lg"
        >
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Refreshing...</span>
        </motion.div>
      )}

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
          onClick={() => fetchTransactions(1, false)}
          className="p-3 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`w-5 h-5 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          {dateRange === 'all' ? t('txn_all_time', 'All Time') : dateRange === 'today' ? t('txn_today', 'Today') : dateRange === 'week' ? t('txn_week', 'This Week') : t('txn_month', 'This Month')}
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
              { key: 'all', label: t('txn_all_time', 'All Time') },
              { key: 'today', label: t('txn_today', 'Today') },
              { key: 'week', label: t('txn_week', 'This Week') },
              { key: 'month', label: t('txn_month', 'This Month') },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => { setDateRange(item.key as typeof dateRange); setShowDateFilter(false) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  dateRange === item.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
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
            }`}>
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

      {/* Transactions List - Grouped by Date */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-6"
      >
        {isLoading ? (
          <div className="card-glass text-center py-12">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Loading transactions...</p>
          </div>
        ) : groupedTransactions.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {groupedTransactions.map((group, groupIndex) => (
              <motion.div
                key={group.date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.05 }}
                className="space-y-3"
              >
                {/* Sticky Date Header */}
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{group.displayDate}</h3>
                        <p className="text-xs text-gray-500">
                          {group.transactions.length} {t('txn_transactions_count', 'transactions')} • 
                          Net: {group.dayTotal.received - group.dayTotal.sent >= 0 ? '+' : ''}₹{ (group.dayTotal.received - group.dayTotal.sent).toLocaleString() }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-sm text-success-600 font-medium">+₹{group.dayTotal.received.toLocaleString()}</span>
                      <span className="text-sm text-danger-600 font-medium">-₹{group.dayTotal.sent.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Transactions in this group */}
                <div className="space-y-2">
                  {group.transactions.map((transaction, txnIndex) => (
                    <TransactionCard
                      key={`${group.date}-${transaction.id}`}
                      transaction={transaction}
                      index={txnIndex}
                      formatAmount={formatAmount}
                      formatDate={formatDate}
                      getRiskBadge={getRiskBadge}
                      getStatusIcon={getStatusIcon}
                      onOpenDetail={() => { setSelectedTransaction(transaction); setShowDetailModal(true); }}
                      t={t}
                    />
                  ))}
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
            <p className="text-gray-500 font-medium">
              {searchQuery 
                ? `${t('txn_no_results', 'No transactions found for')} "${searchQuery}"`
                : filter !== 'all'
                  ? `${t('txn_no_filtered', 'No')} ${t(`txn_filter_${filter}`, filter)} ${t('txn_transactions', 'transactions')}`
                  : t('txn_no_transactions', 'No transactions yet')}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {searchQuery || filter !== 'all' 
                ? t('txn_try_adjusting', 'Try adjusting your filters')
                : t('txn_start_paying', 'Start making payments to see history')}
            </p>
          </motion.div>
        )}

        {/* Load More */}
        {hasMore && !isLoading && !isLoadingMore && (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => fetchTransactions(page + 1, true)}
            className="w-full py-3 border-2 border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
            disabled={isLoadingMore}
          >
            <ChevronDown className="w-5 h-5" />
            {isLoadingMore ? t('txn_loading', 'Loading...') : t('txn_load_more', 'Load More Transactions')}
          </motion.button>
        )}
      </motion.div>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {showDetailModal && selectedTransaction && (
          <TransactionDetailModal
            transaction={selectedTransaction}
            formatAmount={formatAmount}
            formatDate={formatDate}
            getRiskBadge={getRiskBadge}
            getStatusIcon={getStatusIcon}
            onClose={() => { setShowDetailModal(false); setSelectedTransaction(null); }}
            onShare={() => handleShareTransaction(selectedTransaction!)}
            onExportPDF={() => handleExportPDF(selectedTransaction!)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Transaction Card Component
interface TransactionCardProps {
  transaction: WalletTransaction
  index: number
  formatAmount: (amount: number) => string
  formatDate: (dateString: string) => string
  getRiskBadge: (score: number) => React.ReactNode
  getStatusIcon: (status: string) => React.ReactNode | null
  onOpenDetail: () => void
  t: (key: string, fallback: string) => string
}

function TransactionCard({ 
  transaction, 
  index, 
  formatAmount, 
  formatDate, 
  getRiskBadge, 
  getStatusIcon,
  onOpenDetail,
  t,
}: TransactionCardProps) {
  const isDebit = transaction.type === 'debit'
  const isBlocked = transaction.status === 'failed'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.03 }}
      layout
      className={`card-glass flex items-center gap-4 hover:shadow-lg transition-all cursor-pointer ${
        isBlocked 
          ? 'border-l-4 border-danger-500 bg-gradient-to-r from-danger-50 to-white' 
          : 'hover:scale-[1.01]'
      }`}
      onClick={onOpenDetail}
    >
      {/* Direction Icon */}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
        isBlocked
          ? 'bg-danger-100'
          : isDebit 
            ? 'bg-gradient-to-br from-orange-100 to-red-100' 
            : 'bg-gradient-to-br from-emerald-100 to-green-100'
      }`}>
        {isBlocked ? (
          <XCircle className="w-6 h-6 text-danger-600" />
        ) : isDebit ? (
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
          {isBlocked && (
            <span className="text-xs bg-danger-100 text-danger-600 px-2 py-0.5 rounded-full font-medium">
              {t('txn_blocked', 'Blocked')}
            </span>
          )}
          {transaction.guardian_approval_required && transaction.status === 'pending' && (
            <span className="text-xs bg-warning-100 text-warning-600 px-2 py-0.5 rounded-full font-medium">
              {t('txn_guardian_pending', 'Guardian Pending')}
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
          isBlocked 
            ? 'text-gray-400 line-through' 
            : isDebit 
              ? 'text-danger-600' 
              : 'text-success-600'
        }`}>
          {isDebit ? '-' : '+'}{formatAmount(transaction.amount)}
        </p>
        <div className="flex items-center gap-1.5 justify-end mt-1">
          {getRiskBadge(transaction.risk_score || 0)}
          {getStatusIcon(transaction.status)}
        </div>
      </div>
    </motion.div>
  )
}

// Transaction Detail Modal Component
interface TransactionDetailModalProps {
  transaction: WalletTransaction
  formatAmount: (amount: number) => string
  formatDate: (dateString: string) => string
  getRiskBadge: (score: number) => React.ReactNode
  getStatusIcon: (status: string) => React.ReactNode | null
  onClose: () => void
  onShare: () => void
  onExportPDF: () => void
}

function TransactionDetailModal({ 
  transaction, 
  formatAmount, 
  formatDate, 
  getRiskBadge, 
  getStatusIcon,
  onClose,
  onShare,
  onExportPDF,
}: TransactionDetailModalProps) {
  const { t } = useTranslation()
  const isDebit = transaction.type === 'debit'
  const isBlocked = transaction.status === 'failed'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end pb-0"
      onClick={onClose}
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
        className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
        
        <div className="px-6 pb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                isBlocked ? 'bg-danger-100' : isDebit ? 'bg-danger-100' : 'bg-success-100'
              }`}>
                {isBlocked ? (
                  <XCircle className="w-6 h-6 text-danger-600" />
                ) : isDebit ? (
                  <ArrowUpRight className="w-6 h-6 text-danger-600" />
                ) : (
                  <ArrowDownLeft className="w-6 h-6 text-success-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {transaction.counterparty_name || 'Unknown'}
                </h3>
                <p className="text-sm text-gray-500">{transaction.counterparty_upi}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Main Amount */}
          <div className="text-center mb-6">
            <p className={`font-bold text-4xl ${isDebit ? 'text-danger-600' : 'text-success-600'}`}>
              {isDebit ? '-' : '+'}{formatAmount(transaction.amount)}
            </p>
            <p className="text-gray-500 mt-1">{formatDate(transaction.timestamp)}</p>
          </div>

          {/* Status & Risk */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="card p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{t('txn_status', 'Status')}</p>
              <div className="flex items-center justify-center gap-2">
                {getStatusIcon(transaction.status)}
                <span className="font-semibold text-gray-900 capitalize">{transaction.status}</span>
              </div>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{t('txn_risk_score', 'Risk Score')}</p>
              <div className="flex items-center justify-center gap-2">
                {getRiskBadge(transaction.risk_score || 0)}
                <span className="font-semibold text-gray-900">{(transaction.risk_score || 0).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Risk Timeline */}
          {transaction.risk_factors && transaction.risk_factors.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary-600" />
                {t('txn_risk_analysis', 'Risk Analysis')}
              </h4>
              <div className="space-y-2">
                {transaction.risk_factors.map((factor, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-primary-600" />
                    </div>
                    <p className="text-sm text-gray-700">{factor}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Transaction Details */}
          <div className="card p-4 mb-6">
            <h4 className="font-semibold text-gray-900 mb-3">{t('txn_details', 'Details')}</h4>
            <div className="space-y-3">
              <DetailRow label={t('txn_transaction_id', 'Transaction ID')} value={transaction.id} />
              <DetailRow label={t('txn_type', 'Type')} value={isDebit ? t('txn_sent', 'Sent') : t('txn_received', 'Received')} />
              <DetailRow label={t('txn_counterparty', 'Counterparty')} value={transaction.counterparty_name} />
              <DetailRow label={t('txn_upi_id', 'UPI ID')} value={transaction.counterparty_upi} />
              {transaction.category && <DetailRow label={t('txn_category', 'Category')} value={transaction.category} />}
              {transaction.guardian_approval_required && (
                <DetailRow label={t('txn_guardian', 'Guardian')} value={t('txn_required', 'Required')} />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 mt-2">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onShare}
              className="w-full border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Share2 className="w-5 h-5" />
              {t('txn_share', 'Share Transaction')}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onExportPDF}
              className="w-full border-2 border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-5 h-5" />
              {t('txn_export_pdf', 'Export PDF Report')}
            </motion.button>
            <button
              onClick={onClose}
              className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              {t('txn_close', 'Close')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Detail Row Component
interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 truncate text-right max-w-[60%]">{value}</span>
    </div>
  )
}

