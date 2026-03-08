import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  User, 
  Shield, 
  Trophy, 
  Star, 
  TrendingUp,
  Clock,
  Award
} from 'lucide-react'
import { useAuthStore } from '../store'
import { challengeAPI, transactionAPI } from '../api/client'
import RiskGauge from '../components/RiskGauge'
import { useTranslation } from '../contexts/TranslationContext'

export default function Profile() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const [leaderboard, setLeaderboard] = useState<{ user_points: number; user_rank: number; user_streak: number } | null>(null)
  const [txCount, setTxCount] = useState<number>(0)
  const [badges, setBadges] = useState<Array<{ id: string; name: string; description: string; earned: boolean }>>([])
  const [recentActivity, setRecentActivity] = useState<Array<{ action: string; amount: string; time: string }>>([])
  const [_loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [lbRes, txRes, badgeRes, historyRes] = await Promise.all([
          challengeAPI.getLeaderboard().catch(() => ({ data: null })),
          transactionAPI.getHistory(0, 1).catch(() => ({ data: { total: 0 } })),
          challengeAPI.getBadges().catch(() => ({ data: { badges: [] } })),
          transactionAPI.getHistory(0, 5).catch(() => ({ data: { transactions: [] } })),
        ])
        setLeaderboard(lbRes.data)
        setTxCount(txRes.data?.total ?? 0)

        // Map badges
        const badgeList = badgeRes.data?.badges || badgeRes.data || []
        if (Array.isArray(badgeList) && badgeList.length > 0) {
          setBadges(badgeList.map((b: any) => ({
            id: b.id || b.badge_id,
            name: b.name || b.title,
            description: b.description || '',
            earned: b.earned ?? true,
          })))
        }

        // Map recent transactions to activity log
        const txList = historyRes.data?.transactions || historyRes.data || []
        if (Array.isArray(txList) && txList.length > 0) {
          setRecentActivity(txList.map((tx: any) => ({
            action: tx.status === 'blocked' ? `Blocked payment to ${tx.recipient_upi}` 
                   : `Sent to ${tx.recipient_upi}`,
            amount: tx.status === 'blocked' ? `₹${tx.amount?.toLocaleString('en-IN')}` 
                   : `₹${tx.amount?.toLocaleString('en-IN')}`,
            time: tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN') : 'Recently',
          })))
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const userPoints = leaderboard?.user_points ?? 0
  const userLevel = Math.floor(userPoints / 100) + 1
  const progressPct = (userPoints % 100)

  const stats = [
    { label: t('profile_transactions', 'Transactions'), value: txCount.toString() },
    { label: t('profile_xp', 'XP Earned'), value: userPoints.toString() },
    { label: t('profile_rank', 'Rank'), value: leaderboard ? `#${leaderboard.user_rank}` : '-' },
    { label: t('profile_streak', 'Streak'), value: leaderboard ? `${leaderboard.user_streak}d` : '-' },
  ]

  const badgeIcons = [Shield, Award, Trophy, Star]
  const achievements = badges.length > 0 
    ? badges.map((b, i) => ({
        icon: badgeIcons[i % badgeIcons.length],
        title: b.name,
        description: b.description,
        earned: b.earned,
      }))
    : []

  const activityLog = recentActivity.length > 0 
    ? recentActivity 
    : [{ action: 'No recent activity', amount: '', time: 'Make your first payment!' }]

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card bg-gradient-to-r from-primary-600 to-primary-700 text-white"
      >
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-10 h-10" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user?.full_name || 'User'}</h1>
            <p className="text-primary-200">{user?.phone_number || ''}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                Level {userLevel} - {userLevel >= 5 ? 'Fraud Detective' : userLevel >= 3 ? 'Scam Spotter' : 'Beginner'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Security Score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('profile_security_score', 'Security Score')}</h2>
            <p className="text-gray-500 text-sm">{t('profile_based_on', 'Based on your activity & awareness')}</p>
            <div className="flex items-center gap-2 mt-3">
              <TrendingUp className="w-4 h-4 text-success-600" />
              <span className="text-success-600 text-sm font-medium">Active</span>
            </div>
          </div>
          <RiskGauge 
            score={user?.security_score ?? 50} 
            level="LOW" 
            size="md"
          />
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-4 gap-3"
      >
        {stats.map((stat, index) => (
          <div key={index} className="card text-center p-3">
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('profile_achievements', 'Achievements')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {achievements.map((achievement, index) => (
            <div 
              key={index}
              className={`p-3 rounded-xl ${
                achievement.earned ? 'bg-primary-50' : 'bg-gray-50 opacity-50'
              }`}
            >
              <achievement.icon className={`w-8 h-8 mb-2 ${
                achievement.earned ? 'text-primary-600' : 'text-gray-400'
              }`} />
              <h3 className="font-medium text-gray-900">{achievement.title}</h3>
              <p className="text-xs text-gray-500">{achievement.description}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('profile_recent_activity', 'Recent Activity')}</h2>
        <div className="space-y-3">
          {activityLog.map((activity, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
            >
              <div>
                <p className="font-medium text-gray-900">{activity.action}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  {activity.time}
                </p>
              </div>
              <span className={`font-semibold ${
                activity.amount.startsWith('+') ? 'text-success-600' : 'text-gray-900'
              }`}>
                {activity.amount}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* XP Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">{t('profile_level_progress', 'Level Progress')}</h2>
            <p className="text-gray-500 text-sm">{userPoints} / {(userLevel) * 100} XP</p>
          </div>
          <Trophy className="w-6 h-6 text-amber-500" />
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, delay: 0.5 }}
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">{100 - progressPct} XP to Level {userLevel + 1}</p>
      </motion.div>
    </div>
  )
}
