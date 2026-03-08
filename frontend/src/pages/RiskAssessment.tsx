import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Brain,
  Activity,
  Network,
  Cpu,
  Smartphone,
  ArrowLeft,
  Loader2
} from 'lucide-react'
import RiskGauge from '../components/RiskGauge'
import { useTransactionStore } from '../store'
import { transactionAPI } from '../api/client'

export default function RiskAssessment() {
  const { transactionId } = useParams()
  const navigate = useNavigate()
  const { pendingTransaction } = useTransactionStore()
  
  const [loading, setLoading] = useState(false)
  const [assessment, setAssessment] = useState<any>(pendingTransaction?.risk_assessment || null)
  const [modelScores, setModelScores] = useState<Array<{
    name: string; score: number; icon: any; description: string
  }>>([])
  const [featureAnalysis, setFeatureAnalysis] = useState<Array<{
    label: string; value: string; risk: string
  }>>([])

  useEffect(() => {
    const fetchAssessment = async () => {
      if (!pendingTransaction) return
      
      setLoading(true)
      try {
        const { data } = await transactionAPI.assessRisk({
          recipient_upi: pendingTransaction.recipient_upi,
          amount: pendingTransaction.amount,
          note: pendingTransaction.note,
          is_new_recipient: !pendingTransaction.risk_assessment?.recipientVerified,
        })
        
        // Map API response to assessment
        setAssessment({
          risk_score: data.risk_score ?? data.final_score ?? 45,
          risk_level: data.risk_level ?? 'MEDIUM',
          should_proceed: data.should_proceed ?? data.can_proceed ?? true,
          warnings: data.warnings ?? data.all_reasons ?? [],
          explanation: data.explanation ?? data.primary_reason ?? 'Transaction analyzed.',
        })
        
        // Extract individual model scores from response
        const models = data.model_scores || data.models || {}
        setModelScores([
          { name: 'XGBoost', score: Math.round((models.xgboost ?? models.xgboost_risk ?? 0) * 100), icon: Brain, description: 'Pattern Analysis' },
          { name: 'LSTM', score: Math.round((models.lstm ?? models.behavioral ?? 0) * 100), icon: Activity, description: 'Behavioral Profile' },
          { name: 'GNN', score: Math.round((models.gnn ?? models.graph_network ?? 0) * 100), icon: Network, description: 'Network Analysis' },
          { name: 'Isolation Forest', score: Math.round((models.isolation_forest ?? models.anomaly ?? 0) * 100), icon: Cpu, description: 'Anomaly Detection' },
          { name: 'Sensor', score: Math.round((models.sensor ?? models.sensor_stress ?? 0) * 100), icon: Smartphone, description: 'Coercion Detection' },
        ])

        // Build feature analysis from actual API data
        const score = data.risk_score ?? data.final_score ?? 0
        const isNew = data.is_new_recipient ?? !pendingTransaction?.risk_assessment?.recipientVerified
        const amt = pendingTransaction?.amount ?? 0
        const features = [
          { label: 'Recipient', value: isNew ? 'New Contact' : 'Known Contact', risk: isNew ? 'medium' : 'low' },
          { label: 'Amount', value: `₹${amt.toLocaleString()}`, risk: amt > 10000 ? 'high' : amt > 2000 ? 'medium' : 'low' },
          { label: 'Overall Risk', value: score < 25 ? 'Low' : score < 50 ? 'Moderate' : score < 75 ? 'High' : 'Critical', risk: score < 25 ? 'low' : score < 50 ? 'medium' : 'high' },
          { label: 'Time', value: new Date().getHours() >= 22 || new Date().getHours() < 6 ? 'Late Night' : 'Normal Hours', risk: new Date().getHours() >= 22 || new Date().getHours() < 6 ? 'medium' : 'low' },
          { label: 'ML Confidence', value: `${Math.round((data.ml_confidence ?? 0.8) * 100)}%`, risk: (data.ml_confidence ?? 0.8) > 0.7 ? 'low' : 'medium' },
          { label: 'Risk Factors', value: (data.warnings?.length || data.all_reasons?.length || 0).toString(), risk: (data.warnings?.length || 0) > 2 ? 'high' : (data.warnings?.length || 0) > 0 ? 'medium' : 'low' },
        ]
        setFeatureAnalysis(features)
      } catch (error) {
        console.error('Risk assessment error:', error)
        // Show error state instead of fake assessment
        if (!assessment) {
          setAssessment({
            risk_score: 0,
            risk_level: 'UNKNOWN',
            should_proceed: false,
            warnings: ['Risk analysis unavailable — try again'],
            explanation: 'Unable to connect to the analysis server. Please retry.',
          })
        }
      } finally {
        setLoading(false)
      }
    }
    
    fetchAssessment()
  }, [pendingTransaction])

  // Use actual model scores (empty array shows loading state)
  const displayModels = modelScores

  // Risk level mapping for gauge
  const riskLevel = (() => {
    const score = assessment?.risk_score ?? 0
    if (score >= 75) return 'CRITICAL'
    if (score >= 50) return 'HIGH'
    if (score >= 25) return 'MEDIUM'
    return 'LOW'
  })() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-600 animate-spin mb-4" />
        <p className="text-gray-600">Running AI risk analysis...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 hover:text-primary-600"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-2xl font-bold text-gray-900">Detailed Risk Analysis</h1>
        <p className="text-gray-500">Transaction: {transactionId || 'Current'}</p>
      </motion.div>

      {/* Overall Risk Score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card text-center"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Overall Risk Score</h2>
        <RiskGauge 
          score={assessment?.risk_score ?? 0} 
          level={riskLevel}
          size="lg"
        />
        <div className="mt-6 flex items-center justify-center gap-2">
          {assessment?.should_proceed ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-600 font-medium">Safe to proceed</span>
            </>
          ) : (
            <>
              <XCircle className="w-6 h-6 text-red-600" />
              <span className="text-red-600 font-medium">High risk detected</span>
            </>
          )}
        </div>
      </motion.div>

      {/* Model Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Model Analysis</h2>
        <p className="text-gray-500 text-sm mb-6">
          Multiple factors analyzed to assess transaction risk
        </p>

        <div className="space-y-4">
          {displayModels.map((model, index) => (
            <motion.div
              key={model.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex items-center gap-4"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                model.score < 30 ? 'bg-green-100' :
                model.score < 60 ? 'bg-yellow-100' :
                'bg-red-100'
              }`}>
                <model.icon className={`w-5 h-5 ${
                  model.score < 30 ? 'text-green-600' :
                  model.score < 60 ? 'text-yellow-600' :
                  'text-red-600'
                }`} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-gray-900">{model.name}</span>
                  <span className={`font-bold ${
                    model.score < 30 ? 'text-green-600' :
                    model.score < 60 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {model.score}%
                  </span>
                </div>
                <p className="text-xs text-gray-500">{model.description}</p>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${model.score}%` }}
                    transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                    className={`h-full rounded-full ${
                      model.score < 30 ? 'bg-green-500' :
                      model.score < 60 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Warnings */}
      {assessment?.warnings && assessment.warnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card bg-yellow-50 border border-yellow-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-800">Risk Factors Detected</h3>
              <ul className="mt-2 space-y-2">
                {assessment?.warnings.map((warning: string, index: number) => (
                  <li key={index} className="text-yellow-700 text-sm flex items-start gap-2">
                    <span>•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* Explanation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card"
      >
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">AI Explanation</h3>
            <p className="text-gray-600 mt-2">{assessment?.explanation}</p>
          </div>
        </div>
      </motion.div>

      {/* Feature Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Features Analyzed</h2>
        <div className="grid grid-cols-2 gap-4">
          {(featureAnalysis.length > 0 ? featureAnalysis : [
            { label: 'Analyzing...', value: '—', risk: 'low' },
          ]).map((feature, index) => (
            <div 
              key={index}
              className={`p-3 rounded-xl ${
                feature.risk === 'low' ? 'bg-green-50' :
                feature.risk === 'medium' ? 'bg-yellow-50' :
                'bg-red-50'
              }`}
            >
              <p className="text-xs text-gray-500">{feature.label}</p>
              <p className={`font-medium ${
                feature.risk === 'low' ? 'text-green-700' :
                feature.risk === 'medium' ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                {feature.value}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
