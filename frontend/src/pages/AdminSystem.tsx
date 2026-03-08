import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Server,
  ChevronLeft,
  RefreshCw,
  Activity,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Zap,
  MemoryStick,
  Globe,
  Lock,
  Shield,
  FileText
} from 'lucide-react'
import { adminAPI } from '../api/client'
import toast from 'react-hot-toast'

interface SystemMetric {
  name: string
  value: number
  unit: string
  status: 'healthy' | 'warning' | 'critical'
  trend?: number
}

interface ServiceStatus {
  name: string
  status: 'running' | 'stopped' | 'error'
  uptime: string
  memory: string
  lastRestart: string
}

interface SystemLog {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error'
  service: string
  message: string
}

export default function AdminSystem() {
  const navigate = useNavigate()
  
  const [metrics, setMetrics] = useState<SystemMetric[]>([])
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'services' | 'logs'>('overview')
  const [logLevel, setLogLevel] = useState<string>('')
  const [apiLogs, setApiLogs] = useState<SystemLog[]>([])
  const [restartingService, setRestartingService] = useState<string | null>(null)

  useEffect(() => {
    fetchSystemData()
    const interval = setInterval(fetchSystemData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const fetchSystemData = async () => {
    setIsLoading(true)
    setFetchError(false)
    try {
      const response = await adminAPI.getSystemHealth()
      setMetrics(response.data?.metrics || [])
      setServices(response.data?.services || [])
      setLogs(response.data?.logs || [])
    } catch (error) {
      console.error('Failed to fetch system data:', error)
      setMetrics([])
      setServices([])
      setLogs([])
      setFetchError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    if (status === 'running' || status === 'healthy') return 'text-green-400'
    if (status === 'warning' || status === 'stopped') return 'text-yellow-400'
    return 'text-red-400'
  }

  const getLogLevelStyle = (level: string) => {
    const styles: Record<string, string> = {
      info: 'bg-blue-500/20 text-blue-400',
      warning: 'bg-yellow-500/20 text-yellow-400',
      error: 'bg-red-500/20 text-red-400'
    }
    return styles[level] || styles.info
  }

  const getMetricIcon = (name: string) => {
    const icons: Record<string, any> = {
      'CPU Usage': Cpu,
      'Memory Usage': MemoryStick,
      'Disk Usage': HardDrive,
      'Network I/O': Wifi,
      'API Latency': Zap,
      'Error Rate': AlertTriangle
    }
    return icons[name] || Activity
  }

  const healthyServices = services.filter(s => s.status === 'running').length

  if (fetchError && metrics.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <p className="text-gray-300 text-lg font-medium mb-2">Failed to load system data</p>
          <p className="text-gray-500 text-sm mb-4">Could not connect to the server</p>
          <button
            onClick={fetchSystemData}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin/dashboard')}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
                <Server className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">System Health</h1>
                <p className="text-gray-400 text-sm">Infrastructure monitoring and diagnostics</p>
              </div>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-medium rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {healthyServices}/{services.length} Services Running
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchSystemData}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          {['overview', 'services', 'logs'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedTab === tab
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {isLoading ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-6 animate-pulse">
                    <div className="h-4 bg-white/10 rounded mb-3 w-20" />
                    <div className="h-8 bg-white/10 rounded w-16" />
                  </div>
                ))
              ) : (
                metrics.map((metric, index) => {
                  const Icon = getMetricIcon(metric.name)
                  return (
                    <motion.div
                      key={metric.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon className={`w-5 h-5 ${getStatusColor(metric.status)}`} />
                        {metric.trend !== undefined && (
                          <span className={`text-xs ${metric.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {metric.trend >= 0 ? '+' : ''}{metric.trend}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mb-1">{metric.name}</p>
                      <p className="text-2xl font-bold text-white">
                        {metric.value}{metric.unit}
                      </p>
                      {/* Progress bar for percentage metrics */}
                      {metric.unit === '%' && (
                        <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              metric.value >= 80 ? 'bg-red-500' : metric.value >= 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${metric.value}%` }}
                          />
                        </div>
                      )}
                    </motion.div>
                  )
                })
              )}
            </div>

            {/* System Architecture */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
            >
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                System Architecture
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-white/5 rounded-lg">
                  <h4 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    Backend Layer
                  </h4>
                  <ul className="text-gray-300 text-sm space-y-2">
                    <li>• FastAPI (async Python)</li>
                    <li>• SQLAlchemy ORM</li>
                    <li>• JWT Authentication</li>
                    <li>• Rate Limiting</li>
                  </ul>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <h4 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Data Layer
                  </h4>
                  <ul className="text-gray-300 text-sm space-y-2">
                    <li>• PostgreSQL (primary)</li>
                    <li>• MongoDB (reports)</li>
                    <li>• Redis (caching)</li>
                    <li>• S3 (ML models)</li>
                  </ul>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <h4 className="text-purple-400 font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    ML Pipeline
                  </h4>
                  <ul className="text-gray-300 text-sm space-y-2">
                    <li>• 5-Model Ensemble</li>
                    <li>• Real-time Inference</li>
                    <li>• XAI Explanations</li>
                    <li>• Auto-retraining</li>
                  </ul>
                </div>
              </div>
            </motion.div>

            {/* Security Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-r from-green-500/10 to-cyan-500/10 backdrop-blur-sm rounded-xl p-6 border border-green-500/30"
            >
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-green-400" />
                Security Status
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-medium">SSL/TLS</p>
                  <p className="text-green-400 text-sm">Active</p>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-medium">Firewall</p>
                  <p className="text-green-400 text-sm">Enabled</p>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-medium">2FA</p>
                  <p className="text-green-400 text-sm">Enforced</p>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-medium">Encryption</p>
                  <p className="text-green-400 text-sm">AES-256</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Services Tab */}
        {selectedTab === 'services' && (
          <div className="grid gap-4">
            {isLoading ? (
              <div className="bg-white/5 rounded-xl p-12 text-center">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Loading services...</p>
              </div>
            ) : (
              services.map((service, index) => (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-cyan-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${service.status === 'running' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                        <Server className={`w-5 h-5 ${getStatusColor(service.status)}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                        <p className={`text-sm ${getStatusColor(service.status)}`}>
                          {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-sm">
                      <div>
                        <p className="text-gray-500">Uptime</p>
                        <p className="text-white font-medium">{service.uptime}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Memory</p>
                        <p className="text-white font-medium">{service.memory}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Last Restart</p>
                        <p className="text-gray-400">{service.lastRestart}</p>
                      </div>
                      <button 
                        onClick={async () => {
                          const idMap: Record<string, string> = {
                            'ML Inference Service': 'ml_inference',
                            'FastAPI Backend': 'fastapi_backend',
                            'Database': 'database',
                            'PostgreSQL': 'database',
                            'MongoDB': 'database',
                            'Redis Cache': 'ml_inference',
                          }
                          const svcId = idMap[service.name] || 'ml_inference'
                          setRestartingService(service.name)
                          try {
                            await adminAPI.restartService(svcId)
                            toast.success(`${service.name} restarted`)
                          } catch { toast.error('Restart failed') }
                          setRestartingService(null)
                        }}
                        disabled={restartingService === service.name}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-all disabled:opacity-50"
                      >
                        {restartingService === service.name ? 'Restarting...' : 'Restart'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* Logs Tab */}
        {selectedTab === 'logs' && (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                System Logs
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={logLevel}
                  onChange={async (e) => {
                    const lv = e.target.value
                    setLogLevel(lv)
                    try {
                      const resp = await adminAPI.getSystemLogs(1, 50, lv || undefined)
                      setApiLogs(resp.data?.logs || [])
                    } catch {
                      setApiLogs([])
                    }
                  }}
                  className="px-3 py-1 bg-white/10 border border-white/10 rounded text-white text-sm"
                >
                  <option value="">All Levels</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {isLoading ? (
                <div className="p-12 text-center">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-400">Loading logs...</p>
                </div>
              ) : (
                (apiLogs.length > 0 ? apiLogs : logs)
                  .filter(log => !logLevel || log.level === logLevel)
                  .map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-gray-500 text-xs font-mono whitespace-nowrap">
                        {log.timestamp}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLogLevelStyle(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-cyan-400 text-sm font-medium min-w-[120px]">
                        [{log.service}]
                      </span>
                      <span className="text-gray-300 text-sm flex-1">
                        {log.message}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
