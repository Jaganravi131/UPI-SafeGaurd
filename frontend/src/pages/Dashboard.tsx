import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Shield, 
  Send, 
  AlertTriangle, 
  Trophy, 
  TrendingUp,
  ChevronRight,
  Clock,
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Zap,
  ShieldCheck,
  ArrowUpRight,
  BadgeCheck
} from 'lucide-react'
import { useAuthStore } from '../store'
import { walletAPI, authAPI, fraudAPI, transactionAPI } from '../api/client'
import RiskGauge from '../components/RiskGauge'
import { useTranslation } from '../contexts/TranslationContext'

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const { t } = useTranslation()
  const [balance, setBalance] = useState<number | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)
  const [_sessionValid, setSessionValid] = useState(true)
  const [recentAlerts, setRecentAlerts] = useState<{id: number; message: string; time: string; type: string}[]>([])
  const [fraudsBlocked, setFraudsBlocked] = useState(0)
  const [moneySaved, setMoneySaved] = useState(0)

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

  // Periodically validate session (check if logged out from another device)
  // Skip for demo users
  useEffect(() => {
    // Skip session validation for demo users
    if (user?.id === 'demo-user-123') {
      return
    }

    const validateSession = async () => {
      try {
        const response = await authAPI.validateSession()
        if (!response.data.session_valid) {
          setSessionValid(false)
          // Show alert and logout
          alert('You have been logged out because your account was accessed from another device.')
          logout()
        }
      } catch (error) {
        // Token might be invalid - but don't logout for errors
        console.error('Session validation failed:', error)
      }
    }

    // Validate session every 30 seconds
    const interval = setInterval(validateSession, 30000)
    validateSession() // Initial check

    return () => clearInterval(interval)
  }, [logout])

  // Fetch fraud stats and recent alerts from API
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const statsRes = await fraudAPI.getCommunityStats()
        const stats = statsRes.data
        setFraudsBlocked(stats.total_blocked || stats.total_reports || 0)
        setMoneySaved(stats.total_amount_saved || stats.total_amount_reported || 0)
      } catch {
        // Fallback — stats stay at 0
      }
      
      try {
        if (user?.id) {
          const txRes = await transactionAPI.getHistory(1, 10)
          const txns = txRes.data?.transactions || txRes.data || []
          const blocked = txns
            .filter((t: any) => t.status === 'blocked' || (t.risk_score && t.risk_score > 70))
            .slice(0, 3)
            .map((t: any, i: number) => ({
              id: i + 1,
              message: t.status === 'blocked'
                ? `Blocked suspicious payment of ₹${t.amount} to ${t.recipient_upi || t.purpose || 'unknown'}`
                : `Flagged high-risk transaction: ₹${t.amount}`,
              time: t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Recently',
              type: 'blocked'
            }))
          if (blocked.length > 0) setRecentAlerts(blocked)
        }
      } catch {
        // No alerts available
      }
    }
    fetchDashboardData()
  }, [user?.id])

  // Security score from user profile
  const securityScore = user?.security_score ?? 50

  const quickActions = [
    { to: '/pay', icon: Send, label: t('dash_send_money', 'Send Money'), color: 'from-primary-500 to-primary-600', shadow: 'shadow-primary-500/30' },
    { to: '/report', icon: AlertTriangle, label: t('dash_report_fraud', 'Report Fraud'), color: 'from-danger-500 to-danger-600', shadow: 'shadow-danger-500/30' },
    { to: '/challenges', icon: Trophy, label: t('dash_challenges', 'Challenges'), color: 'from-amber-400 to-amber-500', shadow: 'shadow-amber-500/30' },
  ]

  const formatBalance = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount)
  }

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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Premium Wallet Balance Card */}
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
                onClick={() => setShowBalance(!showBalance)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors"
              >
                {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 180 }}
                whileTap={{ scale: 0.9 }}
                onClick={refreshBalance}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors"
                disabled={isLoadingBalance}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBalance ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>
          </div>
          
          <div className="mb-4">
            <motion.div 
              className="text-4xl font-bold tracking-tight"
              key={balance}
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring" }}
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

      {/* Welcome + Protection Status */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-violet-800 p-6 text-white shadow-premium-lg"
      >
        {/* Animated Background */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-10 left-10 w-20 h-20 bg-white/20 rounded-full blur-xl animate-float" />
          <div className="absolute bottom-10 right-10 w-32 h-32 bg-violet-400/30 rounded-full blur-2xl animate-float" style={{ animationDelay: '-3s' }} />
        </div>
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary-200" />
              <span className="text-primary-200 text-sm font-medium">{t('dash_welcome_back', 'Welcome back')}</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">{user?.full_name || t('dash_user', 'User')}</h1>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm w-fit px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span className="text-sm text-emerald-100">{t('dash_money_protected', 'Your money is protected')}</span>
            </div>
          </div>
          <motion.div
            animate={{ 
              scale: [1, 1.05, 1],
              rotate: [0, 2, -2, 0]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div className="absolute inset-0 bg-white/20 rounded-full blur-xl animate-pulse" />
            <div className="relative bg-white/10 backdrop-blur-sm p-4 rounded-2xl">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Security Score - Premium Card */}
      <motion.div
        variants={itemVariants}
        className="card-glass hover-lift"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary-500" />
              <h2 className="text-lg font-semibold text-gray-900">{t('dash_security_score', 'Security Score')}</h2>
            </div>
            <p className="text-gray-500 text-sm">{t('dash_based_on_habits', 'Based on your habits and awareness')}</p>
          </div>
          <RiskGauge 
            score={securityScore} 
            level={securityScore >= 70 ? 'LOW' : securityScore >= 50 ? 'MEDIUM' : 'HIGH'} 
          />
        </div>
        <div className="divider" />
        <Link 
          to="/challenges"
          className="flex items-center justify-between group"
        >
          <div className="flex items-center gap-2 text-primary-600 font-medium">
            <TrendingUp className="w-4 h-4" />
            {t('dash_improve_score', 'Improve your score')}
          </div>
          <div className="flex items-center gap-1 text-primary-500 group-hover:translate-x-1 transition-transform">
            <span className="text-sm">{t('dash_view_challenges', 'View challenges')}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>
      </motion.div>

      {/* Quick Actions - Premium Grid */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('dash_quick_actions', 'Quick Actions')}</h2>
          <span className="text-xs text-gray-400 font-medium">{t('dash_tap_to_start', 'TAP TO START')}</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {quickActions.map((action, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                to={action.to}
                className="card-glass flex flex-col items-center text-center group hover:shadow-xl transition-all duration-300"
              >
                <div className={`bg-gradient-to-br ${action.color} w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg ${action.shadow} group-hover:scale-110 transition-transform duration-300`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-700 group-hover:text-primary-600 transition-colors">{action.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Alerts - Enhanced */}
      <motion.div
        variants={itemVariants}
        className="card-glass"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-danger-100 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-danger-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{t('dash_recent_alerts', 'Recent Alerts')}</h2>
          </div>
          <Link 
            to="/history" 
            className="text-primary-600 text-sm font-medium hover:text-primary-700 flex items-center gap-1"
          >
            {t('dash_view_all', 'View all')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        
        {recentAlerts.length > 0 ? (
          <div className="space-y-3">
            {recentAlerts.map((alert, index) => (
              <motion.div 
                key={alert.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-start gap-3 p-4 rounded-2xl border transition-all hover:shadow-md ${
                  alert.type === 'blocked' 
                    ? 'bg-gradient-to-r from-danger-50 to-danger-50/30 border-danger-100' 
                    : 'bg-gradient-to-r from-warning-50 to-warning-50/30 border-warning-100'
                }`}
              >
                <div className={`p-2 rounded-xl ${
                  alert.type === 'blocked' ? 'bg-danger-100' : 'bg-warning-100'
                }`}>
                  <AlertTriangle className={`w-4 h-4 ${
                    alert.type === 'blocked' ? 'text-danger-600' : 'text-warning-600'
                  }`} />
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
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">{t('dash_no_alerts', 'No recent alerts')}</p>
            <p className="text-gray-400 text-sm">{t('dash_all_safe', "You're all safe!")}</p>
          </div>
        )}
      </motion.div>

      {/* Stats Summary - Premium Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 gap-4"
      >
        <div className="card-glass text-center hover-lift group">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Shield className="w-6 h-6 text-primary-600" />
          </div>
          <div className="text-3xl font-bold text-gradient mb-1">{fraudsBlocked}</div>
          <div className="text-gray-500 text-sm font-medium">{t('dash_frauds_blocked', 'Frauds Blocked')}</div>
        </div>
        <div className="card-glass text-center hover-lift group">
          <div className="w-12 h-12 bg-gradient-to-br from-success-100 to-success-200 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Wallet className="w-6 h-6 text-success-600" />
          </div>
          <div className="text-3xl font-bold text-gradient-success mb-1">₹{moneySaved.toLocaleString('en-IN')}</div>
          <div className="text-gray-500 text-sm font-medium">{t('dash_money_saved', 'Money Saved')}</div>
        </div>
      </motion.div>
    </motion.div>
  )
}
