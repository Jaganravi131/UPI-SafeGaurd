import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  TrendingUp, 
  AlertTriangle, 
  Shield,
  Users,
  MapPin,
  Loader2
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { fraudAPI } from '../api/client'
import { useTranslation } from '../contexts/TranslationContext'

interface CommunityStatsData {
  total_reports: number
  verified_reports: number
  total_amount_saved: number
  users_protected: number
  active_scam_upis: number
}

interface TrendingScam {
  scam_type: string
  report_count: number
  total_amount_lost: number
  trend: string
  description: string
  red_flags: string[]
}

export default function CommunityStats() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<CommunityStatsData | null>(null)
  const [trendingScams, setTrendingScams] = useState<TrendingScam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, trendingRes] = await Promise.all([
        fraudAPI.getCommunityStats().catch(() => ({ data: null })),
        fraudAPI.getTrendingScams().catch(() => ({ data: [] })),
      ])
      setStats(statsRes.data)
      setTrendingScams(trendingRes.data || [])
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }

  const formatAmount = (amount: number): string => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`
    return `₹${amount}`
  }

  // Scam type colors for pie chart
  const COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#22c55e', '#8b5cf6']

  const statCards = stats ? [
    { icon: Shield, value: formatAmount(stats.total_amount_saved), label: t('cs_amount_saved', 'Amount Saved'), color: 'text-success-600', bg: 'bg-success-100' },
    { icon: AlertTriangle, value: stats.total_reports.toLocaleString(), label: t('cs_total_reports', 'Total Reports'), color: 'text-danger-600', bg: 'bg-danger-100' },
    { icon: Users, value: stats.users_protected.toLocaleString(), label: t('cs_users_protected', 'Users Protected'), color: 'text-primary-600', bg: 'bg-primary-100' },
    { icon: MapPin, value: stats.active_scam_upis.toLocaleString(), label: t('cs_upis_flagged', 'Scam UPIs Flagged'), color: 'text-purple-600', bg: 'bg-purple-100' },
  ] : []

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-gray-900">{t('cs_title', 'Community Stats')}</h1>
        <p className="text-gray-500">{t('cs_subtitle', 'See how we\'re protecting India together')}</p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-4"
      >
        {statCards.map((stat, index) => (
          <div key={index} className="card text-center">
            <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-gray-500 text-sm">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Scam Types Distribution - from trending data */}
      {trendingScams.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('cs_scam_types', 'Scam Types')}</h2>
          <div className="flex items-center gap-8">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={trendingScams.map((s, i) => ({ name: s.scam_type, value: s.report_count, color: COLORS[i % COLORS.length] }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    dataKey="value"
                  >
                    {trendingScams.map((_entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {trendingScams.map((type, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="text-sm text-gray-700">{type.scam_type.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{type.report_count} reports</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Trending Scams */}
      {trendingScams.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('cs_trending', 'Trending Scams')}</h2>
          </div>
          <div className="space-y-3">
            {trendingScams.map((scam, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                  <div>
                    <h3 className="font-medium text-gray-900">{scam.scam_type.replace(/_/g, ' ')}</h3>
                    <p className="text-xs text-gray-500">
                      {scam.report_count} reports • {formatAmount(scam.total_amount_lost)} lost
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-danger-600">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">{scam.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Call to Action */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card bg-gradient-to-r from-primary-600 to-primary-700 text-white text-center"
      >
        <h2 className="text-xl font-bold">{t('cs_join_fight', 'Join the Fight Against Fraud')}</h2>
        <p className="text-primary-100 mt-2">
          {t('cs_join_desc', 'Report scams, complete challenges, and help protect your community')}
        </p>
        <div className="flex gap-4 justify-center mt-4">
          <Link to="/report" className="bg-white text-primary-600 px-6 py-2 rounded-full font-semibold hover:bg-primary-50">
            {t('cs_report_scam', 'Report Scam')}
          </Link>
          <Link to="/challenges" className="border-2 border-white px-6 py-2 rounded-full font-semibold hover:bg-white/10">
            {t('cs_take_challenge', 'Take Challenge')}
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
