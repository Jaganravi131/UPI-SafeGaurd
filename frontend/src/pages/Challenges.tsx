import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Trophy, 
  Star, 
  CheckCircle, 
  Lock,
  Gift,
  Loader2
} from 'lucide-react'
import { challengeAPI } from '../api/client'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'

interface ChallengeListItem {
  id: string
  title: string
  category: string
  difficulty: string
  points: number
}

interface ChallengeDetail {
  id: string
  title: string
  category: string
  difficulty: string
  scenario: string
  options: string[]
  points: number
}

interface DailyChallenge {
  id: string
  title: string
  scenario: string
  options: string[]
  points: number
}

interface Badge {
  id: string
  name: string
  description: string
  icon: string
  progress?: number
  total?: number
}

interface BadgesData {
  earned: Badge[]
  available: Badge[]
}

export default function Challenges() {
  const { t } = useTranslation()
  const [challenges, setChallenges] = useState<ChallengeListItem[]>([])
  const [expandedChallenge, setExpandedChallenge] = useState<ChallengeDetail | null>(null)
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null)
  const [showDailyChallenge, setShowDailyChallenge] = useState(false)
  const [dailyAnswer, setDailyAnswer] = useState<number | null>(null)
  const [badges, setBadges] = useState<BadgesData>({ earned: [], available: [] })
  const [leaderboard, setLeaderboard] = useState<{ user_points: number; user_rank: number; user_streak: number } | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [challengesRes, dailyRes, badgesRes, leaderboardRes] = await Promise.all([
        challengeAPI.getChallenges().catch(() => ({ data: [] })),
        challengeAPI.getDailyChallenge().catch(() => ({ data: null })),
        challengeAPI.getBadges().catch(() => ({ data: { earned: [], available: [] } })),
        challengeAPI.getLeaderboard().catch(() => ({ data: null })),
      ])
      setChallenges(challengesRes.data || [])
      setDailyChallenge(dailyRes.data)
      setBadges(badgesRes.data || { earned: [], available: [] })
      setLeaderboard(leaderboardRes.data)
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }

  const handleExpandChallenge = async (challengeId: string) => {
    if (selectedChallengeId === challengeId) {
      setSelectedChallengeId(null)
      setExpandedChallenge(null)
      setSelectedAnswer(null)
      return
    }
    try {
      const res = await challengeAPI.getChallenge(challengeId)
      setExpandedChallenge(res.data)
      setSelectedChallengeId(challengeId)
      setSelectedAnswer(null)
    } catch {
      toast.error('Failed to load challenge')
    }
  }

  const handleSubmit = async (challengeId: string) => {
    if (selectedAnswer === null) return
    setSubmitting(true)
    try {
      const res = await challengeAPI.submit(challengeId, selectedAnswer)
      const data = res.data
      if (data.correct) {
        toast.success(`Correct! +${data.points_earned} XP`)
        setCompletedIds(prev => new Set(prev).add(challengeId))
      } else {
        toast.error('Wrong answer. Try again!')
      }
      setSelectedChallengeId(null)
      setExpandedChallenge(null)
      setSelectedAnswer(null)
    } catch {
      toast.error('Failed to submit answer')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDailySubmit = async () => {
    if (!dailyChallenge || dailyAnswer === null) return
    setSubmitting(true)
    try {
      const res = await challengeAPI.submit(dailyChallenge.id, dailyAnswer)
      const data = res.data
      if (data.correct) {
        toast.success(`Correct! +${data.points_earned} XP`)
      } else {
        toast.error(`Wrong! ${data.explanation}`)
      }
      setShowDailyChallenge(false)
      setDailyAnswer(null)
    } catch {
      toast.error('Failed to submit answer')
    } finally {
      setSubmitting(false)
    }
  }

  const userPoints = leaderboard?.user_points ?? 0
  const userLevel = Math.floor(userPoints / 100) + 1
  const progressInLevel = userPoints % 100
  const pointsToNextLevel = 100 - progressInLevel

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
        <h1 className="text-2xl font-bold text-gray-900">{t('ch_title', 'Security Challenges')}</h1>
        <p className="text-gray-500">{t('ch_subtitle', 'Learn to identify scams and earn rewards')}</p>
      </motion.div>

      {/* XP Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card bg-gradient-to-r from-amber-500 to-orange-500 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100">{t('ch_your_score', 'Your Score')}</p>
            <h2 className="text-3xl font-bold">{userPoints} XP</h2>
            <p className="text-amber-100 text-sm mt-1">{t('ch_level', 'Level')} {userLevel} - {userLevel >= 5 ? t('ch_detective', 'Fraud Detective') : userLevel >= 3 ? t('ch_spotter', 'Scam Spotter') : t('ch_beginner', 'Beginner')}</p>
          </div>
          <Trophy className="w-16 h-16 text-white/90" />
        </div>
        <div className="mt-4 h-2 bg-white/20 rounded-full">
          <div className="h-full bg-white rounded-full" style={{ width: `${progressInLevel}%` }} />
        </div>
        <p className="text-xs text-amber-100 mt-2">{pointsToNextLevel} {t('ch_xp_to', 'XP to Level')} {userLevel + 1}</p>
      </motion.div>

      {/* Daily Challenge */}
      {dailyChallenge && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card border-2 border-primary-500"
        >
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-primary-600" />
            <span className="font-semibold text-primary-600">{t('ch_daily', 'Daily Challenge')}</span>
            <span className="ml-auto text-xs bg-primary-100 text-primary-600 px-2 py-1 rounded-full">
              +{dailyChallenge.points} XP
            </span>
          </div>
          <h3 className="font-semibold text-gray-900">{dailyChallenge.title}</h3>
          <p className="text-gray-600 text-sm mt-1">{dailyChallenge.scenario}</p>

          {showDailyChallenge ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-4 space-y-2"
            >
              {dailyChallenge.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setDailyAnswer(idx)}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    dailyAnswer === idx
                      ? 'bg-primary-100 border-2 border-primary-500'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <span className="font-medium">{String.fromCharCode(65 + idx)}.</span> {option}
                </button>
              ))}
              <button
                onClick={handleDailySubmit}
                disabled={dailyAnswer === null || submitting}
                className="btn-primary w-full mt-2"
              >
                {submitting ? t('ch_submitting', 'Submitting...') : t('ch_submit_answer', 'Submit Answer')}
              </button>
            </motion.div>
          ) : (
            <button onClick={() => setShowDailyChallenge(true)} className="btn-primary w-full mt-4">
              {t('ch_take_challenge', 'Take Challenge')}
            </button>
          )}
        </motion.div>
      )}

      {/* Challenges List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('ch_all_challenges', 'All Challenges')}</h2>
        {challenges.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">{t('ch_none_available', 'No challenges available yet')}</p>
          </div>
        ) : (
        <div className="space-y-3">
          {challenges.map((challenge, index) => {
            const isCompleted = completedIds.has(challenge.id)
            return (
            <motion.div
              key={challenge.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`card ${isCompleted ? 'bg-success-50 border border-success-200' : ''}`}
            >
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => !isCompleted && handleExpandChallenge(challenge.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isCompleted ? 'bg-success-500' : 'bg-primary-100'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : (
                      <Lock className="w-5 h-5 text-primary-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{challenge.title}</h3>
                    <p className="text-xs text-gray-500">+{challenge.points} XP • {challenge.difficulty}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <span className="text-success-600 text-sm font-medium">{t('ch_completed', 'Completed')}</span>
                  )}
                  <Star className={`w-5 h-5 ${isCompleted ? 'text-success-600' : 'text-gray-300'}`} />
                </div>
              </div>

              {/* Expanded Challenge */}
              {selectedChallengeId === challenge.id && expandedChallenge && !isCompleted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-4 pt-4 border-t"
                >
                  <p className="text-gray-700 mb-4">{expandedChallenge.scenario}</p>
                  <div className="space-y-2">
                    {expandedChallenge.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedAnswer(idx)}
                        className={`w-full p-3 rounded-xl text-left transition-all ${
                          selectedAnswer === idx
                            ? 'bg-primary-100 border-2 border-primary-500'
                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <span className="font-medium">{String.fromCharCode(65 + idx)}.</span> {option}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSubmit(challenge.id)}
                    disabled={selectedAnswer === null || submitting}
                    className="btn-primary w-full mt-4"
                  >
                    {submitting ? t('ch_submitting', 'Submitting...') : t('ch_submit_answer', 'Submit Answer')}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )})}
        </div>
        )}
      </motion.div>

      {/* Badges */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('ch_your_badges', 'Your Badges')}</h2>
        {badges.earned.length === 0 && badges.available.length === 0 ? (
          <p className="text-gray-500 text-center py-4">{t('ch_earn_badges', 'Complete challenges to earn badges!')}</p>
        ) : (
          <div className="space-y-4">
            {badges.earned.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">{t('ch_earned', 'Earned')}</p>
                <div className="grid grid-cols-4 gap-4">
                  {badges.earned.map((badge) => (
                    <div key={badge.id} className="text-center">
                      <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <span className="text-xl">{badge.icon}</span>
                      </div>
                      <p className="text-xs font-medium text-gray-700">{badge.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {badges.available.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">{t('ch_in_progress', 'In Progress')}</p>
                <div className="grid grid-cols-4 gap-4">
                  {badges.available.map((badge) => (
                    <div key={badge.id} className="text-center opacity-60">
                      <div className="w-12 h-12 bg-gray-400 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <span className="text-xl">{badge.icon}</span>
                      </div>
                      <p className="text-xs font-medium text-gray-700">{badge.name}</p>
                      {badge.progress !== undefined && badge.total !== undefined && (
                        <p className="text-[10px] text-gray-500">{badge.progress}/{badge.total}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
