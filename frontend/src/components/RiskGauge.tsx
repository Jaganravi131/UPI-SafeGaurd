import { motion } from 'framer-motion'

interface RiskGaugeProps {
  score: number
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  size?: 'sm' | 'md' | 'lg'
}

export default function RiskGauge({ score, level, size = 'md' }: RiskGaugeProps) {
  const sizes = {
    sm: { width: 80, stroke: 6, fontSize: '1rem', labelSize: '0.625rem' },
    md: { width: 120, stroke: 8, fontSize: '1.5rem', labelSize: '0.75rem' },
    lg: { width: 180, stroke: 12, fontSize: '2rem', labelSize: '0.875rem' },
  }

  const colors = {
    LOW: { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)', bg: '#dcfce7' },
    MEDIUM: { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', bg: '#fef3c7' },
    HIGH: { main: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', bg: '#fee2e2' },
    CRITICAL: { main: '#dc2626', glow: 'rgba(220, 38, 38, 0.5)', bg: '#fecaca' },
  }

  const { width, stroke, fontSize, labelSize } = sizes[size]
  const radius = (width - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = circumference - (score / 100) * circumference
  const color = colors[level]

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Glow effect */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: width * 0.85,
          height: width * 0.85,
          background: `radial-gradient(circle, ${color.glow} 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      <svg width={width} height={width} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={stroke}
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${level}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color.main} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color.main} stopOpacity="1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Progress circle */}
        <motion.circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke={`url(#gradient-${level})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: progress }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          filter="url(#glow)"
          style={{
            filter: `drop-shadow(0 0 6px ${color.main})`
          }}
        />
      </svg>
      
      <div className="absolute flex flex-col items-center">
        <motion.span
          className="font-bold bg-gradient-to-b from-gray-900 to-gray-700 bg-clip-text text-transparent"
          style={{ fontSize }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
        >
          {Math.round(score)}
        </motion.span>
        <motion.span 
          className="font-bold px-2 py-0.5 rounded-full"
          style={{ 
            fontSize: labelSize,
            color: color.main,
            backgroundColor: color.bg,
          }}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          {level}
        </motion.span>
      </div>
    </div>
  )
}
