import { Outlet, NavLink } from 'react-router-dom'
import { 
  Shield, 
  Home, 
  Send, 
  History, 
  Users, 
  Settings,
  Sparkles,
  Bot
} from 'lucide-react'
import { useAuthStore } from '../store'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '../contexts/TranslationContext'
import LanguageBar from './LanguageBar'
import NotificationBell from './NotificationBell'

export default function Layout() {
  const { user } = useAuthStore()
  const { t } = useTranslation()

  const navItems = [
    { to: '/dashboard', icon: Home, label: t('nav_home', 'Home') },
    { to: '/pay', icon: Send, label: t('nav_pay', 'Pay') },
    { to: '/history', icon: History, label: t('nav_history', 'History') },
    { to: '/guardian', icon: Users, label: t('nav_guardian', 'Guardian') },
    { to: '/ai-chat', icon: Bot, label: t('nav_ai', 'AI') },
  ]

  return (
    <div className="min-h-screen">
      {/* Premium Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-primary-50/30 to-violet-50/40 -z-20" />
      <div className="fixed inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%236366f1%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] -z-10 opacity-50" />

      {/* Premium Header */}
      <header className="sticky top-0 z-50">
        <div className="mx-3 mt-3">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg shadow-primary-500/5 border border-white/50"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <motion.div 
                className="flex items-center gap-3"
                whileHover={{ scale: 1.02 }}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary-500 rounded-xl blur-lg opacity-30 animate-pulse" />
                  <div className="relative bg-gradient-to-br from-primary-500 to-primary-700 p-2 rounded-xl shadow-lg">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold bg-gradient-to-r from-gray-900 via-primary-800 to-primary-600 bg-clip-text text-transparent">
                    UPI SafeGuard
                  </span>
                  <span className="text-[10px] text-primary-600 font-medium -mt-0.5 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> {t('header_tagline', 'Secure Payments')}
                  </span>
                </div>
              </motion.div>
              
              <div className="flex items-center gap-2">
                <NavLink 
                  to="/profile" 
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50/80 hover:bg-primary-50 text-gray-700 hover:text-primary-600 transition-all duration-300"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-primary-500/20">
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden md:inline text-sm font-medium">{user?.full_name || 'User'}</span>
                </NavLink>
                <NotificationBell />
                <NavLink 
                  to="/settings" 
                  className="p-2.5 rounded-xl bg-gray-50/80 hover:bg-primary-50 text-gray-600 hover:text-primary-600 transition-all duration-300"
                >
                  <Settings className="w-5 h-5" />
                </NavLink>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Floating Language Bar */}
      <LanguageBar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-28 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <Outlet />
        </AnimatePresence>
      </main>

      {/* Premium Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3">
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-premium rounded-2xl overflow-hidden"
        >
          <div className="max-w-lg mx-auto px-1 py-2 flex justify-around">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 
                  `relative flex flex-col items-center py-2 px-3 rounded-xl transition-all duration-300 ${
                    isActive 
                      ? 'text-primary-600' 
                      : 'text-gray-400 hover:text-gray-600'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 bg-gradient-to-t from-primary-100/80 to-primary-50/40 rounded-xl"
                        initial={false}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                      />
                    )}
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      className="relative z-10"
                    >
                      <item.icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'drop-shadow-md' : ''}`} />
                    </motion.div>
                    <span className={`relative z-10 text-[10px] mt-1 font-medium transition-all duration-300 ${isActive ? 'text-primary-700' : ''}`}>
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-dot"
                        className="absolute -top-1 w-1 h-1 rounded-full bg-primary-500"
                        initial={false}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </motion.div>
      </nav>
    </div>
  )
}
