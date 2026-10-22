import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Send,
  QrCode,
  CreditCard,
  Smartphone,
  Zap,
  Shield,
  ShieldCheck,
  Users,
  Clock,
  ArrowRight,
  ChevronRight,
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  BadgeCheck,
  Home,
  Wifi,
  Fuel,
  Tv,
  MoreHorizontal,
  Gift,
} from 'lucide-react'
import { useAuthStore } from '../store'
import { walletAPI, transactionAPI, fraudAPI } from '../api/client'
import AddMoneyModal from '../components/AddMoneyModal'
import { useTranslation } from '../contexts/TranslationContext'
import RiskGauge from '../components/RiskGauge'

// Quick action grid items
const QUICK_ACTIONS = [
  { id: 'send', icon: Send, labelKey: 'home_send', label: 'Send Money', color: 'from-blue-500 to-blue-600', path: '/pay' },
  { id: 'scan', icon: QrCode, labelKey: 'home_scan', label: 'Scan QR', color: 'from-purple-500 to-purple-600', path: '/scan' },
  { id: 'bills', icon: CreditCard, labelKey: 'home_bills', label: 'Bills', color: 'from-green-500 to-green-600', path: '/bills' },
  { id: 'recharge', icon: Smartphone, labelKey: 'home_recharge', label: 'Recharge', color: 'from-orange-500 to-orange-600', path: '/recharge' },
  { id: 'split', icon: Users, labelKey: 'home_split', label: 'Split Bill', color: 'from-pink-500 to-pink-600', path: '/split' },
  { id: 'request', icon: ArrowRight, labelKey: 'home_request', label: 'Request', color: 'from-indigo-500 to-indigo-600', path: '/request' },
  { id: 'rewards', icon: Gift, labelKey: 'home_rewards', label: 'Rewards', color: 'from-amber-500 to-amber-600', path: '/rewards' },
  { id: 'more', icon: MoreHorizontal, labelKey: 'home_more', label: 'More', color: 'from-gray-500 to-gray-600', path: '/services' },
]

// Bill categories
const BILL_CATEGORIES = [
  { id: 'electricity', icon: Zap, labelKey: 'home_electricity', label: 'Electricity', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'water', icon: Wifi, labelKey: 'home_water', label: 'Water', color: 'bg-blue-100 text-blue-700' },
  { id: 'gas', icon: Fuel, labelKey: 'home_gas', label: 'Gas', color: 'bg-orange-100 text-orange-700' },
  { id: 'broadband', icon: Home, labelKey: 'home_broadband', label: 'Broadband', color: 'bg-purple-100 text-purple-700' },
  { id: 'dth', icon: Tv, labelKey: 'home_dth', label: 'DTH', color: 'bg-pink-100 text-pink-700' },
  { id: 'insurance', icon: Shield, labelKey: 'home_insurance', label: 'Insurance', color: 'bg-green-100 text-green-700' },
]

export default function HomeScreen() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  
  // Balance state
  const [balance, setBalance] = useState<number | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)
  const [showAddMoney, setShowAddMoney] = useState(false)
  
  // Recent contacts
  const [recentContacts, setRecentContacts] = useState<Array<{
    id: string
    name: string
    upi_id: string
    avatar?: string
    trust_score?: number
    last_transaction?: string
  }>>([])
  
  // Security & stats
  const [securityScore] = useState(user?.security_score ?? 75)
  const [fraudsBlocked, setFraudsBlocked] = useState(0)
  const [moneySaved, setMoneySaved] = useState(0)
  const [recentAlerts, setRecentAlerts] = useState<Array<{
    id: number
    message: string
    time: string
    type: 'blocked' | 'warning' | 'info'
  }>>([])
  
  const [rewards] = useState<Array<{
    id: string
    title: string
    description: string
    icon: string
    color: string
    expiry: string
  }>>([
    { id: '1', title: 'Cashback ₹50', description: 'On your next bill payment', icon: '💰', color: 'from-amber-400 to-yellow-500', expiry: 'Expires in 3 days' },
    { id: '2', title: '₹25 Reward', description: 'Refer a friend to UPI SafeGuard', icon: '🎁', color: 'from-pink-400 to-rose-500', expiry: 'Expires in 7 days' },
    { id: '3', title: 'Zero Fee', description: 'Free recharge this weekend', icon: '📱', color: 'from-blue-400 to-cyan-500', expiry: 'This weekend only' },
  ])
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  }
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  }
  
  const cardVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, type: 'spring' } },
  }

  // Fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!user?.id) return
      try {
        const response = await walletAPI.getBalance(user.id)
        setBalance(response.data.balance)
      } catch (error) {
        console.error('Failed to fetch balance:', error)
        setBalance(null)
      } finally {
        setIsLoadingBalance(false)
      }
    }
    fetchBalance()
  }, [user?.id])

  // Fetch recent contacts from transaction history
  useEffect(() => {
    const fetchRecentContacts = async () => {
      if (!user?.id) return
      try {
        const response = await transactionAPI.getHistory(1, 20)
        const transactions = response.data?.transactions || response.data || []
        
        // Extract unique recipients from recent transactions
        const contactMap = new Map()
        transactions.forEach((tx: any) => {
          const key = tx.recipient_upi || tx.recipient_name
          if (key && !contactMap.has(key)) {
            contactMap.set(key, {
              id: key,
              name: tx.recipient_name || tx.recipient_upi || 'Unknown',
              upi_id: tx.recipient_upi || '',
              trust_score: tx.trust_score || 75,
              last_transaction: tx.created_at,
            })
          }
        })
        
        const contacts = Array.from(contactMap.values()).slice(0, 5)
        setRecentContacts(contacts)
      } catch (error) {
        console.error('Failed to fetch recent contacts:', error)
      }
    }
    fetchRecentContacts()
  }, [user?.id])

  // Fetch fraud stats and alerts
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const statsRes = await fraudAPI.getCommunityStats()
        const stats = statsRes.data
        setFraudsBlocked(stats.total_blocked || stats.total_reports || 0)
        setMoneySaved(stats.total_amount_saved || stats.total_amount_reported || 0)
      } catch {
        // Fallback
      }
      
      try {
        if (user?.id) {
          const txRes = await transactionAPI.getHistory(1, 10)
          const txns = txRes.data?.transactions || txRes.data || []
          const alerts = txns
            .filter((t: any) => t.status === 'blocked' || (t.risk_score && t.risk_score > 70))
            .slice(0, 3)
            .map((t: any, i: number) => ({
              id: i + 1,
              message: t.status === 'blocked'
                ? `Blocked ₹${t.amount} to ${t.recipient_upi || t.purpose || 'unknown'}`
                : `Flagged high-risk: ₹${t.amount}`,
              time: t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Recently',
              type: t.status === 'blocked' ? 'blocked' : 'warning' as const,
            }))
          if (alerts.length > 0) setRecentAlerts(alerts)
        }
      } catch { }
    }
    fetchDashboardData()
  }, [user?.id])

  const formatBalance = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount)

  const refreshBalance = async () => {
    if (!user?.id) return
    setIsLoadingBalance(true)
    try {
      const response = await walletAPI.getBalance(user.id)
      setBalance(response.data.balance)
    } catch (error) {
      console.error('Failed to refresh balance:', error)
    } finally {
      setIsLoadingBalance(false)
    }
  }

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const getTrustColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100'
    if (score >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  return (
    <>
    <AddMoneyModal
      open={showAddMoney}
      onClose={() => setShowAddMoney(false)}
      onTopUp={() => refreshBalance()}
    />
    <motion.div 
      className="space-y-6 pb-24"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Balance Card - Hero Section */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-premium-lg"
      >
        {/* Background Decorations */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-teal-400/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-emerald-100 text-sm font-medium">{t('dash_available_balance', 'Available Balance')}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span className="text-emerald-200 text-xs">{t('dash_active_account', 'Active Account')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowAddMoney(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors text-sm font-semibold"
                aria-label="Add Money"
              >
                <Plus className="w-4 h-4" />
                Add Money
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowBalance(!showBalance)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors"
                aria-label={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 180 }}
                whileTap={{ scale: 0.9 }}
                onClick={refreshBalance}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors"
                disabled={isLoadingBalance}
                aria-label="Refresh balance"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBalance ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>
          </div>
          
          <div className="mb-4">
            <motion.div 
              className="text-4xl sm:text-5xl font-bold tracking-tight"
              key={balance}
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              {isLoadingBalance ? (
                <span className="text-emerald-200/70">Loading...</span>
              ) : showBalance ? (
                formatBalance(balance || 0)
              ) : (
                '₹ ••••••'
              )}
            </motion.div>
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-white/20">
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-emerald-200" />
              <span className="text-emerald-100 text-sm">{user?.upi_id || t('dash_upi_not_set', 'UPI ID not set')}</span>
            </div>
            <Link 
              to="/pay"
              className="flex items-center gap-1 text-sm font-medium text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {t('dash_send', 'Send')}
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Security Status + Quick Actions */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
        {/* Security Shield Status */}
        <motion.div
          variants={cardVariants}
          className="card-glass p-5 relative overflow-hidden hover-lift"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-primary-100 rounded-xl">
                  <ShieldCheck className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-primary-700 font-semibold text-sm">{t('home_security_status', 'Security Status')}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">{t('home_protected', 'Protected')}</h3>
              <p className="text-green-600 text-sm mt-1 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('home_all_systems', 'All systems secure')}
              </p>
            </div>
            <motion.div
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, 2, -2, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-primary-100 p-3 rounded-2xl">
                <Shield className="w-8 h-8 text-primary-600" />
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Security Score */}
        <motion.div
          variants={cardVariants}
          className="card-glass p-5 relative overflow-hidden hover-lift"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-amber-100 rounded-xl">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-amber-700 font-semibold text-sm">{t('dash_security_score', 'Security Score')}</span>
              </div>
              <RiskGauge 
                score={securityScore} 
                level={securityScore >= 70 ? 'LOW' : securityScore >= 50 ? 'MEDIUM' : 'HIGH'} 
                size="sm"
              />
            </div>
            <Link 
              to="/challenges"
              className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              {t('dash_improve_score', 'Improve')}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {/* Quick Actions Grid */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('home_quick_actions', 'Quick Actions')}</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action, _index) => (
            <motion.div
              key={action.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.96 }}
            >
              <Link
                to={action.path}
                className="card-glass flex flex-col items-center text-center group hover:shadow-xl transition-all duration-300 p-4"
              >
                <div className={`bg-gradient-to-br ${action.color} w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <action.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-semibold text-gray-700 group-hover:text-primary-600 transition-colors">
                  {t(action.labelKey, action.label)}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Contacts - Horizontal Scroll */}
      {recentContacts.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('home_recent_contacts', 'Recent Contacts')}</h2>
            <Link to="/history" className="text-primary-600 text-sm font-medium flex items-center gap-1">
              {t('dash_view_all', 'View all')}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
            {recentContacts.map((contact, _index) => (
              <motion.div
                key={contact.id}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-shrink-0 w-48"
              >
                <Link to={`/pay?contact=${encodeURIComponent(contact.upi_id)}`} className="card-glass p-4 text-center hover-lift">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white font-bold text-xl">
                    {contact.avatar ? contact.avatar : getInitials(contact.name)}
                  </div>
                  <p className="font-semibold text-gray-900 text-sm truncate">{contact.name}</p>
                  <p className="text-xs text-gray-500 truncate mb-2">{contact.upi_id}</p>
                  <div className="flex items-center justify-center gap-1">
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getTrustColor(contact.trust_score || 75)}`}>
                      <ShieldCheck className="w-2.5 h-2.5 inline mr-0.5" />
                      {contact.trust_score}%
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
            {/* Add contact button at end */}
            <motion.div
              variants={itemVariants}
              className="flex-shrink-0 w-48"
            >
              <Link to="/pay" className="card-glass p-4 text-center border-2 border-dashed border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-gray-400" />
                </div>
                <p className="font-semibold text-gray-600 text-sm">{t('home_add_contact', 'Add Contact')}</p>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Bill Categories - Quick Access */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('home_bill_categories', 'Pay Bills')}</h2>
          <Link to="/bills" className="text-primary-600 text-sm font-medium flex items-center gap-1">
            {t('dash_view_all', 'View all')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {BILL_CATEGORIES.slice(0, 6).map((category, _index) => (
            <motion.div
              key={category.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link to={`/bills?category=${category.id}`} className="card-glass p-4 text-center hover-lift group block w-full min-w-0">
                <div className={`${category.color} w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform flex-shrink-0`}>
                  <category.icon className="w-5 h-5" />
                </div>
                <span className="block text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors truncate px-1">
                  {t(category.labelKey, category.label)}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Rewards Carousel */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('home_rewards_offers', 'Rewards & Offers')}</h2>
          <Link to="/rewards" className="text-primary-600 text-sm font-medium flex items-center gap-1">
            {t('dash_view_all', 'View all')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {rewards.map((reward, _index) => (
            <motion.div
              key={reward.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              className="flex-shrink-0 w-64"
            >
              <div className="card-glass p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className={`bg-gradient-to-br ${reward.color} w-12 h-12 rounded-xl flex items-center justify-center mb-3 text-white text-2xl`}>
                    {reward.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">{reward.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{reward.description}</p>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{reward.expiry}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Stats Summary */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
        <motion.div variants={cardVariants} className="card-glass text-center hover-lift group p-5">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Shield className="w-7 h-7 text-primary-600" />
          </div>
          <div className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent mb-1">{fraudsBlocked}</div>
          <div className="text-gray-500 text-sm font-medium">{t('dash_frauds_blocked', 'Frauds Blocked')}</div>
        </motion.div>
        <motion.div variants={cardVariants} className="card-glass text-center hover-lift group p-5">
          <div className="w-14 h-14 bg-gradient-to-br from-success-100 to-success-200 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Wallet className="w-7 h-7 text-success-600" />
          </div>
          <div className="text-3xl font-bold bg-gradient-to-r from-success-600 to-success-400 bg-clip-text text-transparent mb-1">₹{moneySaved.toLocaleString('en-IN')}</div>
          <div className="text-gray-500 text-sm font-medium">{t('dash_money_saved', 'Money Saved')}</div>
        </motion.div>
      </motion.div>

      {/* Security Alerts */}
      {recentAlerts.length > 0 && (
        <motion.div variants={itemVariants} className="card-glass">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-danger-100 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-danger-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{t('dash_recent_alerts', 'Recent Alerts')}</h2>
            </div>
            <Link to="/history" className="text-primary-600 text-sm font-medium flex items-center gap-1">
              {t('dash_view_all', 'View all')}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentAlerts.map((alert, _index) => (
              <motion.div 
                key={alert.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: _index * 0.1 }}
                className={`flex items-start gap-3 p-4 rounded-2xl border transition-all hover:shadow-md ${
                  alert.type === 'blocked' 
                    ? 'bg-gradient-to-r from-danger-50 to-danger-50/30 border-danger-100' 
                    : 'bg-gradient-to-r from-warning-50 to-warning-50/30 border-warning-100'
                }`}
              >
                <div className={`p-2 rounded-xl ${alert.type === 'blocked' ? 'bg-danger-100' : 'bg-warning-100'}`}>
                  <AlertTriangle className={`w-4 h-4 ${alert.type === 'blocked' ? 'text-danger-600' : 'text-warning-600'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-gray-800 text-sm font-medium">{alert.message}</p>
                  <p className="text-gray-500 text-xs flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3 h-3" />
                    {alert.time}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
    </>
  )
}