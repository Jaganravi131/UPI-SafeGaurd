import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield,
  Users,
  AlertTriangle,
  TrendingUp,
  Activity,
  LogOut,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  FileWarning,
  Brain,
  Server
} from 'lucide-react'
import { adminAPI, adminAuthAPI } from '../api/client'
import { useAdminStore } from '../store'

// Types
interface DashboardStats {
  total_users: number
  active_users: number
  total_transactions: number
  flagged_transactions: number
  fraud_reports_pending: number
  total_fraud_reports: number
  average_risk_score: number
  ml_model_accuracy: number
}

interface RiskDistribution {
  low: number
  medium: number
  high: number
  critical: number
}

interface RecentActivity {
  id: string
  action: string
  admin_email?: string
  admin_id?: string
  details: string | Record<string, any>
  timestamp?: string
  created_at?: string
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { admin, adminLogout } = useAdminStore()
  
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [riskDistribution, setRiskDistribution] = useState<RiskDistribution | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [flaggedTransactions, setFlaggedTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    fetchDashboardData()
    // Auto-refresh every 15 seconds for real-time updates
    const interval = setInterval(() => fetchDashboardData(true), 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setIsLoading(true)
    setFetchError(false)
    try {
      // Fetch all dashboard data in parallel
      const [overviewRes, riskRes, activityRes, flaggedRes] = await Promise.all([
        adminAPI.getDashboardOverview(),
        adminAPI.getRiskDistribution(30),
        adminAPI.getActivityLogs(1, 5),
        adminAPI.getFlaggedTransactions(1, 5),
      ])

      setStats(overviewRes.data)
      setRiskDistribution(riskRes.data)
      setRecentActivity(activityRes.data?.logs || [])
      setFlaggedTransactions(flaggedRes.data?.transactions || [])
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      if (!silent) { setStats(null); setFetchError(true) }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await adminAuthAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    adminLogout()
    navigate('/admin/login')
  }

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color, 
    trend, 
    subtitle 
  }: { 
    title: string
    value: string | number
    icon: any
    color: string
    trend?: number
    subtitle?: string
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium">{title}</p>
          <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
          {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1">
          <TrendingUp className={`w-4 h-4 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`} />
          <span className={`text-sm ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-gray-500 text-sm">vs last week</span>
        </div>
      )}
    </motion.div>
  )

  const RiskBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
    const percentage = total > 0 ? (value / total) * 100 : 0
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{label}</span>
          <span className="text-white font-medium">{value}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full ${color} rounded-full`}
          />
        </div>
      </div>
    )
  }

  if (fetchError && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <p className="text-gray-300 text-lg font-medium mb-2">Failed to load dashboard</p>
          <p className="text-gray-500 text-sm mb-4">Could not connect to the server</p>
          <button
            onClick={() => fetchDashboardData()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const totalRisk = riskDistribution 
    ? riskDistribution.low + riskDistribution.medium + riskDistribution.high + riskDistribution.critical 
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-gray-400 text-sm">UPI SafeGuard Control Center</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => fetchDashboardData()}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                title="Refresh data"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <div className="text-right">
                <p className="text-white text-sm font-medium">{admin?.full_name || 'Admin'}</p>
                <p className="text-gray-400 text-xs capitalize">{admin?.role?.replace('_', ' ')}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Last Refresh */}
        <div className="mb-6 flex items-center gap-2 text-gray-500 text-sm">
          <Clock className="w-4 h-4" />
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Users"
            value={stats?.total_users?.toLocaleString() || '0'}
            icon={Users}
            color="bg-blue-500"
            trend={12}
            subtitle={`${stats?.active_users || 0} active`}
          />
          <StatCard
            title="Transactions"
            value={stats?.total_transactions?.toLocaleString() || '0'}
            icon={Activity}
            color="bg-green-500"
            trend={8}
            subtitle={`${stats?.flagged_transactions || 0} flagged`}
          />
          <StatCard
            title="Fraud Reports"
            value={stats?.total_fraud_reports || '0'}
            icon={FileWarning}
            color="bg-orange-500"
            subtitle={`${stats?.fraud_reports_pending || 0} pending review`}
          />
          <StatCard
            title="ML Accuracy"
            value={`${stats?.ml_model_accuracy?.toFixed(1) || '0'}%`}
            icon={Brain}
            color="bg-purple-500"
            trend={2}
            subtitle="5-model ensemble"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Risk Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Risk Distribution</h2>
                <p className="text-gray-400 text-sm">Transaction risk levels (30 days)</p>
              </div>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-4">
              <RiskBar 
                label="Low Risk (0-25)" 
                value={riskDistribution?.low || 0} 
                total={totalRisk} 
                color="bg-green-500" 
              />
              <RiskBar 
                label="Medium Risk (26-50)" 
                value={riskDistribution?.medium || 0} 
                total={totalRisk} 
                color="bg-yellow-500" 
              />
              <RiskBar 
                label="High Risk (51-75)" 
                value={riskDistribution?.high || 0} 
                total={totalRisk} 
                color="bg-orange-500" 
              />
              <RiskBar 
                label="Critical Risk (76-100)" 
                value={riskDistribution?.critical || 0} 
                total={totalRisk} 
                color="bg-red-500" 
              />
            </div>
            
            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">Total assessed: {totalRisk.toLocaleString()}</span>
              <span className="text-gray-400">
                Avg score: <span className="text-white font-medium">{stats?.average_risk_score?.toFixed(1) || '0'}</span>
              </span>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={() => navigate('/admin/users')}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-400" />
                  <span className="text-white">Manage Users</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => navigate('/admin/fraud-reports')}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <span className="text-white">Review Reports</span>
                  {(stats?.fraud_reports_pending || 0) > 0 && (
                    <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                      {stats?.fraud_reports_pending}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => navigate('/admin/ml-models')}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <span className="text-white">ML Performance</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => navigate('/admin/system')}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-green-400" />
                  <span className="text-white">System Health</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            <button className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 p-3 bg-white/5 rounded-lg"
                >
                  <div className={`p-2 rounded-lg ${
                    activity.action.includes('login') ? 'bg-blue-500/20' :
                    activity.action.includes('update') ? 'bg-green-500/20' :
                    activity.action.includes('flag') ? 'bg-orange-500/20' :
                    'bg-gray-500/20'
                  }`}>
                    {activity.action.includes('login') ? (
                      <LogOut className="w-4 h-4 text-blue-400" />
                    ) : activity.action.includes('approve') ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : activity.action.includes('reject') ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Activity className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">{activity.action}</p>
                    <p className="text-gray-500 text-xs">
                      {typeof activity.details === 'string' ? activity.details : JSON.stringify(activity.details || '')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">{activity.admin_email}</p>
                    <p className="text-gray-500 text-xs">
                      {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString() 
                        : activity.created_at ? new Date(activity.created_at).toLocaleTimeString()
                        : ''}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent Suspicious Transactions — real-time */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-white">Suspicious Transactions</h2>
              {flaggedTransactions.length > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full animate-pulse">
                  {flaggedTransactions.length} new
                </span>
              )}
            </div>
            <span className="text-gray-500 text-xs">Auto-refreshes every 15s</span>
          </div>
          <div className="space-y-2">
            {flaggedTransactions.length > 0 ? (
              flaggedTransactions.map((txn: any) => (
                <div
                  key={txn.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${
                    txn.status === 'blocked' 
                      ? 'bg-red-500/10 border-red-500/30'
                      : txn.status === 'guardian_pending'
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-orange-500/10 border-orange-500/30'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    txn.status === 'blocked' ? 'bg-red-500/20' : 'bg-orange-500/20'
                  }`}>
                    <AlertTriangle className={`w-4 h-4 ${
                      txn.status === 'blocked' ? 'text-red-400' : 'text-orange-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium truncate">
                        {txn.sender_name || 'Unknown'} → {txn.recipient_upi}
                      </p>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        txn.status === 'blocked' ? 'bg-red-500/20 text-red-300' :
                        txn.status === 'guardian_pending' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-orange-500/20 text-orange-300'
                      }`}>
                        {txn.status === 'blocked' ? 'BLOCKED' : 
                         txn.status === 'guardian_pending' ? 'PENDING' : 
                         txn.risk_level?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Risk: {(txn.risk_score * 100).toFixed(0)}% | {txn.risk_factors?.slice(0, 2).join(', ') || 'No factors'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-bold">₹{txn.amount?.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">
                      {txn.created_at ? new Date(txn.created_at).toLocaleTimeString() : ''}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                <p className="text-sm">No suspicious transactions detected</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Pending Alerts Section */}
        {(stats?.fraud_reports_pending || 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-400" />
              <div className="flex-1">
                <p className="text-orange-300 font-medium">
                  {stats?.fraud_reports_pending} pending fraud reports require review
                </p>
                <p className="text-orange-400/70 text-sm">
                  Click to review and take action on reported suspicious activities
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/fraud-reports')}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
              >
                Review Now
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
