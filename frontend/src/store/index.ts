import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  phone_number: string
  full_name: string
  email?: string
  upi_id?: string
  security_score: number
  digital_literacy: 'beginner' | 'intermediate' | 'advanced'
  guardian_enabled: boolean
  preferred_language: string
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  setAuth: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => {
        localStorage.setItem('token', token)
        set({ token, user, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('token')
        useTransactionStore.getState().clearAll()
        set({ token: null, user: null, isAuthenticated: false })
      },
      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
    }
  )
)

interface Transaction {
  id: string
  recipient_upi: string
  amount: number
  status: string
  risk_score?: number
  created_at: string
}

interface TransactionState {
  pendingTransaction: {
    recipient_upi: string
    amount: number
    note?: string
    risk_assessment?: {
      risk_score?: number
      risk_level?: string
      should_proceed?: boolean
      warnings?: string[]
      explanation?: string
      isSafe?: boolean
      safetyScore?: 'safe' | 'caution' | 'risky' | 'dangerous'
      recipientName?: string
      recipientVerified?: boolean
      tips?: string[]
      reasons?: string[]
    }
  } | null
  setPendingTransaction: (transaction: TransactionState['pendingTransaction']) => void
  clearPendingTransaction: () => void
  recentTransactions: Transaction[]
  addTransaction: (transaction: Transaction) => void
  clearAll: () => void
}

export const useTransactionStore = create<TransactionState>((set) => ({
  pendingTransaction: null,
  setPendingTransaction: (transaction) => set({ pendingTransaction: transaction }),
  clearPendingTransaction: () => set({ pendingTransaction: null }),
  recentTransactions: [],
  addTransaction: (transaction) =>
    set((state) => ({
      recentTransactions: [transaction, ...state.recentTransactions].slice(0, 10),
    })),
  clearAll: () => set({ pendingTransaction: null, recentTransactions: [] }),
}))

interface UIState {
  language: string
  voiceAlertsEnabled: boolean
  notifications: {
    riskAlerts: boolean
    guardianRequests: boolean
    scamTrends: boolean
    challengeReminders: boolean
  }
  setLanguage: (language: string) => void
  toggleVoiceAlerts: () => void
  toggleNotification: (key: 'riskAlerts' | 'guardianRequests' | 'scamTrends' | 'challengeReminders') => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: 'en',
      voiceAlertsEnabled: true,
      notifications: {
        riskAlerts: true,
        guardianRequests: true,
        scamTrends: false,
        challengeReminders: true,
      },
      setLanguage: (language) => set({ language }),
      toggleVoiceAlerts: () =>
        set((state) => ({ voiceAlertsEnabled: !state.voiceAlertsEnabled })),
      toggleNotification: (key) =>
        set((state) => ({
          notifications: {
            ...state.notifications,
            [key]: !state.notifications[key],
          },
        })),
    }),
    {
      name: 'ui-storage',
    }
  )
)

// Admin Types
interface Admin {
  id: string
  email: string
  username: string
  full_name: string
  role: 'super_admin' | 'admin' | 'analyst' | 'support'
  is_active: boolean
  last_login?: string
  created_at: string
}

interface AdminAuthState {
  adminToken: string | null
  admin: Admin | null
  isAdminAuthenticated: boolean
  setAdminAuth: (token: string, admin: Admin) => void
  adminLogout: () => void
  updateAdmin: (admin: Partial<Admin>) => void
}

export const useAdminStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      adminToken: null,
      admin: null,
      isAdminAuthenticated: false,
      setAdminAuth: (token, admin) => {
        localStorage.setItem('admin_token', token)
        set({ adminToken: token, admin, isAdminAuthenticated: true })
      },
      adminLogout: () => {
        localStorage.removeItem('admin_token')
        set({ adminToken: null, admin: null, isAdminAuthenticated: false })
      },
      updateAdmin: (adminData) =>
        set((state) => ({
          admin: state.admin ? { ...state.admin, ...adminData } : null,
        })),
    }),
    {
      name: 'admin-auth-storage',
    }
  )
)
