import axios from 'axios'

// Generate unique device ID for session tracking
const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('device_id')
  if (!deviceId) {
    deviceId = 'device_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15))
    localStorage.setItem('device_id', deviceId)
  }
  return deviceId
}

const getDeviceInfo = (): string => {
  const ua = navigator.userAgent
  const deviceId = getDeviceId()
  const browserInfo = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Browser'
  return `${browserInfo} | ${deviceId}`
}

const api = axios.create({
  // In development the Vite proxy forwards /api → localhost:8000, so the
  // relative path works. For production builds VITE_API_BASE_URL must be set
  // to the full backend URL (e.g. https://your-backend.onrender.com/api/v1).
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token and device info
api.interceptors.request.use((config) => {
  // Add device info header
  config.headers['X-Device-Info'] = getDeviceInfo()
  
  // Check for admin token first (for admin routes)
  const adminToken = localStorage.getItem('admin_token')
  const userToken = localStorage.getItem('token')
  
  // Use admin token for admin routes, otherwise use user token
  const isAdminRoute = config.url?.startsWith('/admin')
  const token = isAdminRoute ? adminToken : userToken
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor for error handling including session invalidation
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAdminRoute = error.config?.url?.startsWith('/admin')
    
    if (error.response?.status === 401) {
      if (isAdminRoute) {
        localStorage.removeItem('admin_token')
        window.location.href = '/admin/login'
      } else {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  requestOTP: (identifier: string) => api.post('/auth/request-otp', { phone_number: identifier }),
  verifyOTP: (identifier: string, otp: string) => api.post('/auth/verify-otp', { phone_number: identifier, otp }),
  verifyFirebaseToken: (idToken: string) => api.post('/auth/verify-firebase-token', { id_token: idToken }),
  register: (data: { phone_number: string; full_name: string; upi_id?: string; email?: string }) =>
    api.post('/auth/register', data),
  validateSession: () => api.post('/auth/validate-session'),
  logout: () => api.post('/auth/logout'),
}

// Transaction API
export const transactionAPI = {
  assessRisk: (data: {
    recipient_upi: string
    amount: number
    note?: string
    is_new_recipient?: boolean
    call_active?: boolean
  }) => api.post('/transactions/assess-risk', data),
  create: (data: {
    recipient_upi: string
    amount: number
    purpose?: string
    risk_token?: string
    sensor_data?: {
      gyroscope: { x: number; y: number; z: number }
      accelerometer: { x: number; y: number; z: number }
      touch_pressure: number
      typing_speed: number
    }
  }) =>
    api.post('/transactions/create', data),
  getHistory: (skip?: number, limit?: number) =>
    api.get('/transactions/history', { params: { page: skip ? Math.floor(skip / (limit || 20)) + 1 : 1, page_size: limit } }),
  checkRecipient: (upi_id: string) =>
    api.post('/transactions/check-recipient', { upi_id }),
}

// Fraud API
export const fraudAPI = {
  // Real-time transaction analysis with NLP scam detection
  analyzeTransaction: (data: {
    user_id: string
    recipient_upi: string
    amount: number
    recipient_name?: string
    is_verified?: boolean
    trust_score?: number
    note?: string  // Transaction note for AI scam detection
    sensor_data?: {
      gyroscope: { x: number; y: number; z: number }
      accelerometer: { x: number; y: number; z: number }
      touch_pressure: number
      typing_speed: number
    }
  }) => api.post('/fraud/analyze', data),
  
  submitReport: (data: {
    scam_type: string
    description: string
    scammer_upi?: string
    amount_lost: number
    has_evidence?: boolean
    evidence_urls?: string[]
  }) => api.post('/fraud/report', data),
  uploadEvidence: (reportId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    return api.post(`/fraud/report/${reportId}/upload-evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getTrendingScams: () => api.get('/fraud/trending'),
  getCommunityStats: () => api.get('/fraud/stats'),
}

// Contacts API - Phone to UPI lookup
export const contactsAPI = {
  search: (phone?: string, upi_id?: string) => 
    api.get('/contacts/search', { params: { phone, upi_id } }),
  verifyUPI: (upi_id: string) => 
    api.get(`/contacts/verify-upi/${encodeURIComponent(upi_id)}`),
  getAllContacts: () => api.get('/contacts/all'),
  getKnownScammers: () => api.get('/contacts/scammers'),
}

// Guardian API
export const guardianAPI = {
  setup: (data: { guardian_phone: string; guardian_name: string; relationship: string; approval_threshold?: number }) =>
    api.post('/guardian/setup', data),
  list: () => api.get('/guardian/list'),
  remove: (guardianId: string) => api.delete(`/guardian/${guardianId}`),
  accept: (guardianshipId: string) =>
    api.post(`/guardian/accept/${guardianshipId}`),
  decline: (guardianshipId: string) =>
    api.post(`/guardian/decline/${guardianshipId}`),
  getMyWards: () => api.get('/guardian/my-wards'),
  getPendingApprovals: () => api.get('/guardian/pending-approvals'),
  approve: (transactionId: string) =>
    api.post(`/guardian/approve/${transactionId}`),
  reject: (transactionId: string, reason?: string) =>
    api.post(`/guardian/reject/${transactionId}`, null, { params: { reason } }),
}

// Notifications API
export const notificationsAPI = {
  getAll: (unreadOnly?: boolean) =>
    api.get('/notifications/', { params: { unread_only: unreadOnly } }),
  markRead: (notificationId: string) =>
    api.post(`/notifications/${notificationId}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}

// Wallet/Sandbox Banking API
export const walletAPI = {
  getBalance: (userId: string) => api.get(`/wallet/balance/${userId}`),
  getWalletInfo: (userId: string) => api.get(`/wallet/info/${userId}`),
  getTransactions: (userId: string, limit?: number) => 
    api.get(`/wallet/transactions/${userId}`, { params: { limit } }),
  transfer: (userId: string, data: { recipient_upi: string; amount: number; note?: string }) =>
    api.post(`/wallet/transfer/${userId}`, data),
  adminSearch: (query: string) => 
    api.get('/wallet/admin/search', { params: { q: query } }),
  adminAllTransactions: (limit?: number) =>
    api.get('/wallet/admin/all-transactions', { params: { limit } }),
}

// Challenge API
export const challengeAPI = {
  getChallenges: () => api.get('/challenges/list'),
  getChallenge: (challengeId: string) => api.get(`/challenges/${challengeId}`),
  getDailyChallenge: () => api.get('/challenges/daily'),
  submit: (challengeId: string, answer: number) =>
    api.post(`/challenges/${challengeId}/submit`, null, { params: { answer } }),
  getLeaderboard: () => api.get('/challenges/leaderboard'),
  getBadges: () => api.get('/challenges/badges'),
  getCategories: () => api.get('/challenges/categories/list'),
}

// Security Shield API - 7-Layer Analysis
export const securityAPI = {
  analyze: (data: {
    upi_id: string
    amount: number
    user_id?: string
    note?: string
    environment?: {
      screen_recording: boolean
      screen_sharing: boolean
      overlay_detected: boolean
      device_rooted: boolean
      call_active?: boolean
      suspicious_apps?: string[]
    }
    user_profile?: {
      avg_transaction_amount: number
      max_transaction_amount: number
      transaction_count: number
      account_age_days: number
      security_score: number
    }
  }) => api.post('/security/analyze', data),
}

// Admin API
export const adminAPI = {
  // Dashboard
  getDashboardOverview: () => api.get('/admin/dashboard/overview'),
  getRiskDistribution: (days?: number) => api.get('/admin/analytics/risk-distribution', { params: { days } }),
  getFraudTypes: () => api.get('/admin/analytics/fraud-types'),
  getMLPerformance: () => api.get('/admin/ml/performance'),
  getSystemHealth: () => api.get('/admin/system/health'),
  
  // User Management
  getUsers: (page?: number, pageSize?: number, search?: string) => 
    api.get('/admin/users', { params: { page, page_size: pageSize, search } }),
  getUserDetails: (userId: string) => api.get(`/admin/users/${userId}`),
  updateUserSecurityScore: (userId: string, score: number) =>
    api.put(`/admin/users/${userId}/security-score`, null, { params: { security_score: score } }),
  updateUserStatus: (userId: string, isActive: boolean) =>
    api.put(`/admin/users/${userId}/status`, null, { params: { is_active: isActive } }),
  editUser: (userId: string, data: {
    full_name?: string; email?: string; digital_literacy?: string;
    daily_limit?: number; per_transaction_limit?: number; guardian_threshold?: number;
  }) => api.put(`/admin/users/${userId}/edit`, data),
  exportUsers: (format: 'csv' | 'json' = 'csv') =>
    api.get('/admin/users/export', { params: { format }, responseType: 'blob' }),
  
  // Fraud Reports
  getFraudReports: (page?: number, pageSize?: number, status?: string) =>
    api.get('/admin/fraud-reports', { params: { page, page_size: pageSize, status } }),
  updateReportStatus: (reportId: string, status: string) =>
    api.put(`/admin/fraud-reports/${reportId}/status`, null, { params: { status } }),
  exportFraudReports: (format: 'csv' | 'json' = 'csv', status?: string) =>
    api.get('/admin/fraud-reports/export', { params: { format, status }, responseType: 'blob' }),
  
  // ML Models
  getMLModels: () => api.get('/admin/ml/models'),
  retrainModel: (modelId: string) => api.post(`/admin/ml/models/${modelId}/retrain`),
  updateModelStatus: (modelId: string, status: string) =>
    api.put(`/admin/ml/models/${modelId}/status`, null, { params: { status } }),
  getModelConfig: () => api.get('/admin/ml/models/config'),
  updateModelConfig: (modelId: string, weight: number) =>
    api.put(`/admin/ml/models/${modelId}/config`, null, { params: { weight } }),
  
  // Activity Logs
  getActivityLogs: (page?: number, pageSize?: number, action?: string) =>
    api.get('/admin/activity-logs', { params: { page, page_size: pageSize, action } }),
  
  // System Logs (filtered)
  getSystemLogs: (page?: number, pageSize?: number, level?: string) =>
    api.get('/admin/system/logs', { params: { page, page_size: pageSize, level } }),
  
  // Service management
  restartService: (serviceName: string) =>
    api.post(`/admin/system/services/${serviceName}/restart`),
  
  // Flagged / Suspicious Transactions
  getFlaggedTransactions: (page?: number, pageSize?: number) =>
    api.get('/admin/transactions/flagged', { params: { page, page_size: pageSize } }),
  
  // Admin Management
  getAdmins: () => api.get('/admin/admins'),
}

// Admin Auth API (separate for clarity)
export const adminAuthAPI = {
  login: (email: string, password: string) =>
    api.post('/admin/auth/login', { email, password }),
  logout: () => api.post('/admin/auth/logout'),
  getCurrentAdmin: () => api.get('/admin/auth/me'),
  demoLogin: () => api.post('/admin/auth/demo-login'),
  createFirstAdmin: (data: { email: string; username: string; password: string; full_name: string }) =>
    api.post('/admin/auth/create-first-admin', data),
}

// Intervention API - AI-driven real-time transaction intervention
export const interventionAPI = {
  check: (data: {
    transaction_id: string;
    user_id: string;
    risk_score: number;
    risk_factors: Record<string, any>;
    transaction_data: Record<string, any>;
  }) =>
    api.post('/intervention/check', data),
  resolve: (data: { intervention_id: string; challenge_responses: Array<{challenge_id: string; answer: string}>; guardian_approved?: boolean }) =>
    api.post('/intervention/resolve', data),
  getActive: (userId: string) =>
    api.get(`/intervention/active/${userId}`),
  cancel: (interventionId: string) =>
    api.delete(`/intervention/cancel/${interventionId}`),
  getThresholds: () =>
    api.get('/intervention/thresholds'),
  getStats: () =>
    api.get('/intervention/stats'),
}

// AI API — Groq LLM-powered translation, chatbot, scam explainer
export const aiAPI = {
  getLanguages: () =>
    api.get('/ai/languages'),
  getSuggestedPrompts: (language: string) =>
    api.get<{ language: string; prompts: string[] }>(`/ai/suggested-prompts?language=${language}`),
  translate: (text: string, target_language: string) =>
    api.post('/ai/translate', { text, target_language }),
  translateAlerts: (texts: string[], target_language: string) =>
    api.post('/ai/translate-alerts', { texts, target_language }),
  translateUI: (strings: Record<string, string>, target_language: string) =>
    api.post<{ translations: Record<string, string>; language: string; language_name: string }>(
      '/ai/translate-ui', { strings, target_language }
    ),
  explainScam: (data: { scam_type: string; risk_factors: string[]; amount: number; target_language: string }) =>
    api.post('/ai/explain-scam', data),
  chat: (data: { message: string; language: string; conversation_history?: Array<{role: string; content: string}> }) =>
    api.post('/ai/chat', data),
  voiceAlert: (data: { alert_type: string; context: Record<string, any>; target_language: string }) =>
    api.post('/ai/voice-alert', data),
}

export default api
