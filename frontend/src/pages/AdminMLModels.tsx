import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Brain,
  ChevronLeft,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Settings,
  BarChart3,
  Cpu,
  Zap
} from 'lucide-react'
import { adminAPI } from '../api/client'
import toast from 'react-hot-toast'

interface MLModel {
  id: string
  name: string
  type: string
  description: string
  status: 'active' | 'training' | 'inactive' | 'error'
  accuracy: number
  precision: number
  recall: number
  f1_score: number
  latency_ms: number
  predictions_today: number
  last_trained: string
  version: string
  trend: 'up' | 'down' | 'stable'
}

export default function AdminMLModels() {
  const navigate = useNavigate()
  
  const [models, setModels] = useState<MLModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<MLModel | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [configWeight, setConfigWeight] = useState(20)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    setIsLoading(true)
    try {
      const response = await adminAPI.getMLModels()
      setModels(response.data?.models || [])
    } catch (error) {
      console.error('Failed to fetch models:', error)
      toast.error('Failed to load ML models')
      setModels([])
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      active: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
      training: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: RefreshCw },
      inactive: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Pause },
      error: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertTriangle }
    }
    return badges[status] || badges.inactive
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />
    return <Activity className="w-4 h-4 text-gray-400" />
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 95) return 'text-green-400'
    if (accuracy >= 90) return 'text-blue-400'
    if (accuracy >= 85) return 'text-yellow-400'
    return 'text-red-400'
  }

  const handleRetrain = async (modelId: string) => {
    try {
      await adminAPI.retrainModel(modelId)
      toast.success(`Retraining queued for model ${modelId}`)
      setModels(models.map(m => m.id === modelId ? { ...m, status: 'training' as const } : m))
    } catch (error) {
      console.error('Failed to retrain:', error)
      toast.error('Failed to queue retraining')
    }
  }

  const handleToggleStatus = async (modelId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    try {
      await adminAPI.updateModelStatus(modelId, newStatus)
      toast.success(`Model ${modelId} set to ${newStatus}`)
      setModels(models.map(m => m.id === modelId ? { ...m, status: newStatus as any } : m))
    } catch (error) {
      console.error('Failed to update status:', error)
      toast.error('Failed to update model status')
    }
  }

  const avgAccuracy = models.length > 0
    ? (models.reduce((sum, m) => sum + m.accuracy, 0) / models.length).toFixed(1)
    : '0'

  const totalPredictions = models.reduce((sum, m) => sum + m.predictions_today, 0)

  const avgLatency = models.length > 0
    ? (models.reduce((sum, m) => sum + m.latency_ms, 0) / models.length).toFixed(0)
    : '0'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">ML Model Observatory</h1>
                <p className="text-gray-400 text-sm">5-Model Ensemble Performance Monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchModels}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-gray-400 text-sm">Active Models</span>
            </div>
            <p className="text-3xl font-bold text-white">{models.filter(m => m.status === 'active').length} / {models.length}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-gray-400 text-sm">Avg Accuracy</span>
            </div>
            <p className="text-3xl font-bold text-white">{avgAccuracy}%</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-gray-400 text-sm">Predictions Today</span>
            </div>
            <p className="text-3xl font-bold text-white">{totalPredictions.toLocaleString()}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Cpu className="w-5 h-5 text-yellow-400" />
              </div>
              <span className="text-gray-400 text-sm">Avg Latency</span>
            </div>
            <p className="text-3xl font-bold text-white">{avgLatency}ms</p>
          </motion.div>
        </div>

        {/* Models Grid */}
        <div className="grid gap-6">
          {isLoading ? (
            <div className="bg-white/5 rounded-xl p-12 text-center">
              <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Loading models...</p>
            </div>
          ) : (
            models.map((model, index) => {
              const statusBadge = getStatusBadge(model.status)
              const StatusIcon = statusBadge.icon
              
              return (
                <motion.div
                  key={model.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold text-white">{model.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusBadge.bg} ${statusBadge.text}`}>
                          <StatusIcon className={`w-3 h-3 ${model.status === 'training' ? 'animate-spin' : ''}`} />
                          {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                        </span>
                        <span className="px-2 py-1 bg-white/10 text-gray-400 rounded text-xs">
                          v{model.version}
                        </span>
                        {getTrendIcon(model.trend)}
                      </div>
                      <p className="text-gray-400 text-sm mb-4">{model.description}</p>
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Accuracy</p>
                          <p className={`text-xl font-bold ${getAccuracyColor(model.accuracy)}`}>{model.accuracy}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Precision</p>
                          <p className="text-lg font-semibold text-white">{model.precision}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Recall</p>
                          <p className="text-lg font-semibold text-white">{model.recall}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">F1 Score</p>
                          <p className="text-lg font-semibold text-white">{model.f1_score}%</p>
                        </div>
                        <div className="border-l border-white/10 pl-6">
                          <p className="text-gray-500 text-xs mb-1">Latency</p>
                          <p className="text-lg font-semibold text-cyan-400">{model.latency_ms}ms</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Predictions</p>
                          <p className="text-lg font-semibold text-white">{model.predictions_today.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleRetrain(model.id)}
                        disabled={model.status === 'training'}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Retrain
                      </button>
                      <button
                        onClick={() => handleToggleStatus(model.id, model.status)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                          model.status === 'active'
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {model.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {model.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => { setSelectedModel(model); setConfigWeight(20); setShowModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        Configure
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>

        {/* Ensemble Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            5-Model Ensemble Architecture
          </h3>
          <p className="text-gray-300 mb-4">
            Our fraud detection system uses a sophisticated ensemble of 5 specialized ML models, each targeting different aspects of fraud:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-purple-400 font-semibold mb-1">GNN</p>
              <p className="text-gray-400 text-xs">Network Analysis</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-green-400 font-semibold mb-1">XGBoost</p>
              <p className="text-gray-400 text-xs">Risk Scoring</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-blue-400 font-semibold mb-1">LSTM</p>
              <p className="text-gray-400 text-xs">Behavior Pattern</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-yellow-400 font-semibold mb-1">Isolation</p>
              <p className="text-gray-400 text-xs">Anomaly Detection</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-pink-400 font-semibold mb-1">Sensor</p>
              <p className="text-gray-400 text-xs">Stress Detection</p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Model Config Modal */}
      {showModal && selectedModel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-white/10"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">{selectedModel.name} Settings</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-2">Model Version</label>
                <input
                  type="text"
                  value={selectedModel.version}
                  readOnly
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-2">Last Trained</label>
                <input
                  type="text"
                  value={new Date(selectedModel.last_trained).toLocaleString()}
                  readOnly
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-2">Weight in Ensemble ({configWeight}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={configWeight}
                  onChange={(e) => setConfigWeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const idMap: Record<string, string> = { xgboost_risk_scorer: 'xgb', behavioral_profiler: 'lstm', isolation_forest: 'iso', graph_network: 'gnn', sensor_detector: 'sensor' }
                      const apiId = idMap[selectedModel!.id] || selectedModel!.id
                      await adminAPI.updateModelConfig(apiId, configWeight / 100)
                      toast.success(`Weight updated: ${configWeight}%`)
                      setShowModal(false)
                    } catch (err) {
                      toast.error('Failed to save config')
                    }
                  }}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
