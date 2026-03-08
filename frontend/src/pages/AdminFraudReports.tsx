import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  DollarSign,
  Calendar
} from 'lucide-react'
import { adminAPI } from '../api/client'
import toast from 'react-hot-toast'

interface FraudReport {
  id: string
  reporter_name: string
  reporter_phone: string
  scammer_upi: string
  scam_type: string
  amount_lost: number
  description: string
  status: 'pending' | 'verified' | 'rejected'
  verification_score: number
  created_at: string
  incident_date?: string
  users_protected: number
}

export default function AdminFraudReports() {
  const navigate = useNavigate()
  
  const [reports, setReports] = useState<FraudReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedReport, setSelectedReport] = useState<FraudReport | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const pageSize = 10

  // Auto-refresh every 10 seconds when enabled
  useEffect(() => {
    fetchReports()
    
    let interval: ReturnType<typeof setInterval> | null = null
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchReports(true) // silent refresh
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [currentPage, statusFilter, autoRefresh])

  const fetchReports = async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const response = await adminAPI.getFraudReports(currentPage, pageSize, statusFilter === 'all' ? undefined : statusFilter)
      const newReports = response.data?.reports || []
      
      // Check for new reports
      if (reports.length > 0 && newReports.length > 0) {
        const newReportIds = newReports.map((r: FraudReport) => r.id)
        const existingIds = reports.map(r => r.id)
        const hasNewReports = newReportIds.some((id: string) => !existingIds.includes(id))
        
        if (hasNewReports && silent) {
          // Show notification for new reports
          const audio = new Audio('/notification.mp3')
          audio.play().catch(() => {}) // Play sound if available
        }
      }
      
      setReports(newReports)
      setTotalPages(Math.ceil((response.data?.total || 0) / pageSize) || 1)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch reports:', error)
      if (!silent) {
        // No reports available
        setReports([])
        setTotalPages(1)
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Clock },
      verified: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
      rejected: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle }
    }
    return badges[status] || badges.pending
  }

  const getScamTypeBadge = (type: string) => {
    const types: Record<string, string> = {
      fake_merchant: 'Customer Care Scam',
      lottery_scam: 'Lottery/Prize Scam',
      marketplace_fraud: 'Marketplace Fraud',
      phishing: 'Phishing Attack',
      job_scam: 'Job Fraud',
      investment_scam: 'Investment Fraud',
      loan_scam: 'Loan Fraud',
      qr_scam: 'QR Code Scam',
      bank_call: 'Fake Bank Call',
      digital_arrest: 'Digital Arrest',
      remote_access: 'Remote Access Scam',
      lottery: 'Lottery/Prize Scam',
      other: 'Other'
    }
    return types[type] || type.replace('_', ' ')
  }

  const handleViewReport = (report: FraudReport) => {
    setSelectedReport(report)
    setShowModal(true)
  }

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      await adminAPI.updateReportStatus(reportId, newStatus)
      fetchReports()
      setShowModal(false)
    } catch (error) {
      console.error('Failed to update status:', error)
      // For demo, just update locally
      setReports(reports.map(r => r.id === reportId ? { ...r, status: newStatus as any } : r))
      setShowModal(false)
    }
  }

  const pendingCount = reports.filter(r => r.status === 'pending').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
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
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Fraud Reports</h1>
                <p className="text-gray-400 text-sm">Review and verify reported scams</p>
              </div>
              {pendingCount > 0 && (
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-sm font-medium rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Auto-refresh toggle */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Auto-refresh</span>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <span className="text-gray-500 text-xs">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
              <button
                onClick={() => fetchReports()}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={async () => {
                  try {
                    const resp = await adminAPI.exportFraudReports('csv', statusFilter === 'all' ? undefined : statusFilter)
                    const blob = new Blob([resp.data], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'fraud_reports.csv'; a.click()
                    URL.revokeObjectURL(url)
                    toast.success('Exported fraud reports')
                  } catch { toast.error('Export failed') }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by UPI ID, reporter name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Reports Grid */}
        <div className="grid gap-4">
          {isLoading ? (
            <div className="bg-white/5 rounded-xl p-12 text-center">
              <RefreshCw className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-12 text-center text-gray-400">
              No fraud reports found
            </div>
          ) : (
            reports.map((report) => {
              const statusBadge = getStatusBadge(report.status)
              const StatusIcon = statusBadge.icon
              
              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusBadge.bg} ${statusBadge.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                        </span>
                        <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                          {getScamTypeBadge(report.scam_type)}
                        </span>
                        <span className="text-gray-500 text-xs">
                          Score: {report.verification_score}%
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-medium">Scammer UPI:</span>
                        <code className="px-2 py-1 bg-red-500/10 text-red-400 rounded text-sm">
                          {report.scammer_upi}
                        </code>
                      </div>
                      
                      <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                        {report.description}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          ₹{(report.amount_lost || 0).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(report.created_at).toLocaleDateString()}
                        </span>
                        <span>Reported by: {report.reporter_name}</span>
                        {report.users_protected > 0 && (
                          <span className="text-green-400">
                            🛡️ {report.users_protected} users protected
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewReport(report)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        title="View Details"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(report.id, 'verified')}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(report.id, 'rejected')}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-gray-400 text-sm">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>

      {/* Report Detail Modal */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl border border-white/10 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Fraud Report Details</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Scammer Info */}
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <h4 className="text-red-400 font-semibold mb-2">Scammer Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-sm">UPI ID</p>
                    <code className="text-red-400">{selectedReport.scammer_upi}</code>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Scam Type</p>
                    <p className="text-white">{getScamTypeBadge(selectedReport.scam_type)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Amount Lost</p>
                    <p className="text-white font-bold">₹{(selectedReport.amount_lost || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Incident Date</p>
                    <p className="text-white">{selectedReport.incident_date ? new Date(selectedReport.incident_date).toLocaleDateString() : 'Not specified'}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-white font-semibold mb-2">Description</h4>
                <p className="text-gray-300 p-4 bg-white/5 rounded-lg">{selectedReport.description}</p>
              </div>

              {/* Reporter Info */}
              <div>
                <h4 className="text-white font-semibold mb-2">Reporter Information</h4>
                <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-gray-500 text-sm">Name</p>
                    <p className="text-white">{selectedReport.reporter_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Phone</p>
                    <p className="text-white">{selectedReport.reporter_phone}</p>
                  </div>
                </div>
              </div>

              {/* Verification */}
              <div>
                <h4 className="text-white font-semibold mb-2">AI Verification</h4>
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-400 text-sm">Verification Score</span>
                      <span className="text-white font-medium">{selectedReport.verification_score}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${selectedReport.verification_score >= 70 ? 'bg-green-500' : selectedReport.verification_score >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${selectedReport.verification_score}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {selectedReport.status === 'pending' && (
                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => handleUpdateStatus(selectedReport.id, 'verified')}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Verify Report
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReport.id, 'rejected')}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    Reject Report
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
