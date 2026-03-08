import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, 
  Volume2, 
  VolumeX,
  Bell,
  Shield,
  ChevronRight,
  LogOut
} from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useTranslation } from '../contexts/TranslationContext'

export default function Settings() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()
  const { language, setLanguage, voiceAlertsEnabled, toggleVoiceAlerts, notifications, toggleNotification } = useUIStore()
  const { t } = useTranslation()
  const [showLanguages, setShowLanguages] = useState(false)

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'हिंदी (Hindi)' },
    { code: 'ta', name: 'தமிழ் (Tamil)' },
    { code: 'te', name: 'తెలుగు (Telugu)' },
    { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
    { code: 'ml', name: 'മലയാളം (Malayalam)' },
    { code: 'mr', name: 'मराठी (Marathi)' },
    { code: 'bn', name: 'বাংলা (Bengali)' },
    { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
    { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
    { code: 'or', name: 'ଓଡ଼ିଆ (Odia)' },
    { code: 'as', name: 'অসমীয়া (Assamese)' },
  ]

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-gray-900">{t('settings_title', 'Settings')}</h1>
        <p className="text-gray-500">{t('settings_subtitle', 'Customize your experience')}</p>
      </motion.div>

      {/* Language Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <button
          onClick={() => setShowLanguages(!showLanguages)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary-600" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">{t('settings_language', 'Language')}</h3>
              <p className="text-sm text-gray-500">
                {languages.find(l => l.code === language)?.name || 'English'}
              </p>
            </div>
          </div>
          <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showLanguages ? 'rotate-90' : ''}`} />
        </button>

        {showLanguages && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-4 pt-4 border-t max-h-64 overflow-y-auto"
          >
            <div className="grid grid-cols-2 gap-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code)
                    toast.success(`Language changed to ${lang.name}`)
                    setShowLanguages(false)
                  }}
                  className={`p-3 rounded-xl text-left transition-all ${
                    language === lang.code
                      ? 'bg-primary-100 border-2 border-primary-500'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-medium text-gray-900">{lang.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Voice Alerts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              {voiceAlertsEnabled ? (
                <Volume2 className="w-5 h-5 text-amber-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-amber-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t('settings_voice_alerts', 'Voice Alerts')}</h3>
              <p className="text-sm text-gray-500">{t('settings_speak_warnings', 'Speak warnings in your language')}</p>
            </div>
          </div>
          <button
            onClick={toggleVoiceAlerts}
            className={`w-12 h-6 rounded-full transition-all ${
              voiceAlertsEnabled ? 'bg-primary-600' : 'bg-gray-300'
            }`}
          >
            <motion.div
              animate={{ x: voiceAlertsEnabled ? 24 : 2 }}
              className="w-5 h-5 bg-white rounded-full shadow"
            />
          </button>
        </div>
      </motion.div>

      {/* Notification Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card space-y-4"
      >
        <h2 className="font-semibold text-gray-900">{t('settings_notifications', 'Notifications')}</h2>
        
        {([
          { key: 'riskAlerts' as const, label: t('settings_risk_alerts', 'Risk Alerts'), description: t('settings_risk_alerts_desc', 'High-risk transaction warnings') },
          { key: 'guardianRequests' as const, label: t('settings_guardian_requests', 'Guardian Requests'), description: t('settings_guardian_desc', 'Approval requests from family') },
          { key: 'scamTrends' as const, label: t('settings_scam_trends', 'Scam Trends'), description: t('settings_scam_desc', 'New scams in your area') },
          { key: 'challengeReminders' as const, label: t('settings_challenge_reminders', 'Challenge Reminders'), description: t('settings_challenge_desc', 'Daily security challenges') },
        ]).map((item, index) => (
          <div key={index} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-gray-400" />
              <div>
                <h3 className="font-medium text-gray-900">{item.label}</h3>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
            <button
              onClick={() => toggleNotification(item.key)}
              className={`w-10 h-5 rounded-full transition-all ${
                notifications[item.key] ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <motion.div
                initial={false}
                animate={{ x: notifications[item.key] ? 20 : 2 }}
                className="w-4 h-4 bg-white rounded-full shadow"
              />
            </button>
          </div>
        ))}
      </motion.div>

      {/* Security Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card space-y-4"
      >
        <h2 className="font-semibold text-gray-900">{t('settings_security', 'Security')}</h2>
        
        <div className="w-full flex items-center justify-between py-2 px-2 -mx-2">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{t('settings_security_score', 'Security Score')}</span>
          </div>
          <span className={`text-sm font-medium ${(user?.security_score || 0) >= 60 ? 'text-success-600' : 'text-amber-600'}`}>
            {user?.security_score || 0}/100
          </span>
        </div>

        <div className="w-full flex items-center justify-between py-2 px-2 -mx-2">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{t('settings_guardian_mode', 'Guardian Mode')}</span>
          </div>
          <span className={`text-sm font-medium ${user?.guardian_enabled ? 'text-success-600' : 'text-gray-500'}`}>
            {user?.guardian_enabled ? t('settings_enabled', 'Enabled') : t('settings_disabled', 'Disabled')}
          </span>
        </div>

        <div className="w-full flex items-center justify-between py-2 px-2 -mx-2">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{t('settings_digital_literacy', 'Digital Literacy')}</span>
          </div>
          <span className="text-gray-500 text-sm capitalize">{user?.digital_literacy || 'intermediate'}</span>
        </div>

        <div className="w-full flex items-center justify-between py-2 px-2 -mx-2">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{t('settings_upi_pin', 'UPI PIN')}</span>
          </div>
          <span className="text-success-600 text-sm font-medium">{t('settings_protected', 'Protected')}</span>
        </div>
      </motion.div>

      {/* About */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card"
      >
        <h2 className="font-semibold text-gray-900 mb-4">{t('settings_about', 'About')}</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>UPI SafeGuard v2.0.0</p>
          <p>© 2025 All rights reserved</p>
          <div className="flex gap-4 pt-2">
            <button onClick={() => navigate('/privacy')} className="text-primary-600 hover:underline">{t('settings_privacy', 'Privacy Policy')}</button>
            <button onClick={() => navigate('/terms')} className="text-primary-600 hover:underline">{t('settings_terms', 'Terms of Service')}</button>
          </div>
        </div>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <button
          onClick={handleLogout}
          className="w-full card flex items-center justify-center gap-2 text-danger-600 hover:bg-danger-50"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-semibold">{t('settings_logout', 'Logout')}</span>
        </button>
      </motion.div>
    </div>
  )
}
