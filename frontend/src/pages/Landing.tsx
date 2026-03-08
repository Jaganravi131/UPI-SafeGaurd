import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Shield, 
  Brain, 
  Users, 
  Trophy, 
  AlertTriangle, 
  CheckCircle,
  Globe,
  Mic,
  Sparkles,
  Zap,
  ArrowRight,
  Lock
} from 'lucide-react'

export default function Landing() {
  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Detection',
      description: 'Real-time ML models analyze transaction patterns to catch fraud before it happens',
      color: 'text-primary-600',
      bg: 'bg-gradient-to-br from-primary-100 to-primary-200',
      glow: 'group-hover:shadow-primary-500/20',
    },
    {
      icon: AlertTriangle,
      title: 'Pre-Payment Alerts',
      description: 'Get warnings BEFORE confirming suspicious payments, not after',
      color: 'text-warning-600',
      bg: 'bg-gradient-to-br from-warning-100 to-warning-200',
      glow: 'group-hover:shadow-warning-500/20',
    },
    {
      icon: Users,
      title: 'Guardian Mode',
      description: 'Family members can protect vulnerable users from scams',
      color: 'text-success-600',
      bg: 'bg-gradient-to-br from-success-100 to-success-200',
      glow: 'group-hover:shadow-success-500/20',
    },
    {
      icon: Globe,
      title: '12 Indian Languages',
      description: 'Voice alerts and explanations in your preferred language',
      color: 'text-blue-600',
      bg: 'bg-gradient-to-br from-blue-100 to-blue-200',
      glow: 'group-hover:shadow-blue-500/20',
    },
    {
      icon: Trophy,
      title: 'Learn & Earn',
      description: 'Gamified security challenges to build fraud awareness',
      color: 'text-amber-600',
      bg: 'bg-gradient-to-br from-amber-100 to-amber-200',
      glow: 'group-hover:shadow-amber-500/20',
    },
    {
      icon: Mic,
      title: 'Coercion Detection',
      description: 'Detects if you\'re being pressured during calls or stressed',
      color: 'text-danger-600',
      bg: 'bg-gradient-to-br from-danger-100 to-danger-200',
      glow: 'group-hover:shadow-danger-500/20',
    },
  ]

  const stats = [
    { value: '94.2%', label: 'Fraud Detection Accuracy' },
    { value: '<2s', label: 'Real-time Analysis' },
    { value: '50+', label: 'Risk Features Analyzed' },
    { value: '99%', label: 'Uptime Reliability' },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-violet-900">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-5s' }} />
        </div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />

        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            {/* Logo */}
            <motion.div
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, 2, -2, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative inline-block mb-8"
            >
              <div className="absolute inset-0 bg-white/20 rounded-3xl blur-2xl animate-pulse" />
              <div className="relative bg-white/10 backdrop-blur-sm p-6 rounded-3xl border border-white/20">
                <Shield className="w-16 h-16 md:w-20 md:h-20 text-white" />
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4"
            >
              <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 px-4 py-2 rounded-full text-sm font-medium border border-white/20">
                <Sparkles className="w-4 h-4" />
                Real-time Fraud Detection
              </span>
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
              UPI SafeGuard
            </h1>
            
            <p className="text-lg md:text-2xl text-primary-100 mb-10 max-w-3xl mx-auto leading-relaxed">
              Smart fraud prevention that protects your money 
              <span className="font-bold text-white"> BEFORE</span> you send it
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  to="/login"
                  className="inline-flex items-center justify-center bg-white text-primary-700 font-bold py-4 px-8 rounded-2xl text-lg hover:bg-primary-50 transition-all shadow-premium hover:shadow-premium-lg group"
                >
                  Get Protected Now
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <a 
                  href="#features"
                  className="inline-flex items-center justify-center border-2 border-white/50 text-white font-bold py-4 px-8 rounded-2xl text-lg hover:bg-white/10 hover:border-white transition-all backdrop-blur-sm"
                >
                  Learn More
                </a>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="relative -mt-10 z-10 max-w-5xl mx-auto px-4">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-premium-lg border border-white/50 p-8"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent mb-1">
                  {stat.value}
                </div>
                <div className="text-gray-500 text-sm font-medium">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-gradient-to-b from-white to-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <Zap className="w-4 h-4" />
                Premium Features
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
                How We Protect You
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Advanced analysis protects every transaction in real-time
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`group card-glass hover:shadow-xl ${feature.glow} transition-all duration-300 hover:-translate-y-1`}
              >
                <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 bg-white/10 text-white/90 px-4 py-2 rounded-full text-sm font-medium mb-4 border border-white/20">
              <Lock className="w-4 h-4" />
              Simple & Secure
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: 1, title: 'Scan to Pay', description: 'Scan any QR code or enter UPI ID as usual', icon: '📱' },
              { step: 2, title: 'Risk Analysis', description: 'Multiple risk factors analyzed in real-time', icon: '🔍' },
              { step: 3, title: 'Get Protected', description: 'Receive clear warnings with explanations before confirming', icon: '🛡️' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
                viewport={{ once: true }}
                className="relative text-center"
              >
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-primary-500/30 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-violet-600 text-white rounded-full flex items-center justify-center text-3xl font-bold shadow-lg shadow-primary-500/30">
                    {item.icon}
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center text-primary-600 font-bold text-sm shadow-lg">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-400">
                  {item.description}
                </p>
                {index < 2 && (
                  <div className="hidden md:block absolute top-10 right-0 w-1/2 h-0.5 bg-gradient-to-r from-primary-500/50 to-transparent" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary-600 via-primary-700 to-violet-700 py-24">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.05%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Don't Become a Victim
            </h2>
            <p className="text-xl text-primary-100 mb-10">
              Join millions protecting themselves with UPI SafeGuard
            </p>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link 
                to="/login"
                className="inline-flex items-center justify-center bg-white text-primary-700 font-bold py-4 px-10 rounded-2xl text-lg hover:bg-primary-50 transition-all shadow-premium group"
              >
                Start Free Protection
                <CheckCircle className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-500 to-primary-700 p-2 rounded-xl">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">UPI SafeGuard</span>
            </div>
            <p className="text-gray-400 text-center mb-2">
              Protecting India's digital payments with AI
            </p>
            <div className="flex items-center gap-2 text-primary-400 text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Fraud Prevention</span>
            </div>
            <div className="flex gap-6 text-gray-500 text-sm">
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</Link>
              <span className="text-gray-500">Contact</span>
            </div>
            <p className="text-gray-600 text-sm mt-8">
              © 2025 UPI SafeGuard. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
