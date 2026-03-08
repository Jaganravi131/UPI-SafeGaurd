import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldOff, Home, ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full text-center"
      >
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          className="relative inline-block mb-8"
        >
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center mx-auto">
            <ShieldOff className="w-16 h-16 text-primary-500" />
          </div>
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-full bg-primary-400/20 animate-ping" style={{ animationDuration: '3s' }} />
        </motion.div>

        {/* Error Code */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-7xl font-black text-gradient mb-2"
        >
          404
        </motion.h1>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            The page you're looking for doesn't exist or has been moved.
            Let's get you back to safety.
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary w-full flex items-center justify-center gap-2 py-4"
          >
            <Home className="w-5 h-5" />
            Go to Dashboard
          </button>

          <button
            onClick={() => navigate(-1)}
            className="btn-outline w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Go Back
          </button>
        </motion.div>

        {/* Decorative footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 text-xs text-gray-400 flex items-center justify-center gap-1"
        >
          <Search className="w-3 h-3" />
          Protected by UPI Shield Security
        </motion.p>
      </motion.div>
    </div>
  )
}
