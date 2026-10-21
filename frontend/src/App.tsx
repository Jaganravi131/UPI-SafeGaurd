import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import { TranslationProvider } from './contexts/TranslationContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import NotFound from './pages/NotFound'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import LoadingSpinner from './components/LoadingSpinner'

// Public routes - loaded immediately
import Landing from './pages/Landing'
import Login from './pages/Login'

// Admin routes - lazy loaded
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminFraudReports = lazy(() => import('./pages/AdminFraudReports'))
const AdminMLModels = lazy(() => import('./pages/AdminMLModels'))
const AdminSystem = lazy(() => import('./pages/AdminSystem'))

// User routes - lazy loaded
const HomeScreen = lazy(() => import('./pages/HomeScreen'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const BillsPage = lazy(() => import('./pages/BillsPage'))
const RechargePage = lazy(() => import('./pages/RechargePage'))
const SplitBillPage = lazy(() => import('./pages/SplitBillPage'))
const RequestMoneyPage = lazy(() => import('./pages/RequestMoneyPage'))
const PaymentFlowV2 = lazy(() => import('./pages/PaymentFlowV2'))
const RiskAssessment = lazy(() => import('./pages/RiskAssessment'))
const TransactionHistoryV2 = lazy(() => import('./pages/TransactionHistoryV2'))
const GuardianMode = lazy(() => import('./pages/GuardianMode'))
const Challenges = lazy(() => import('./pages/Challenges'))
const FraudReport = lazy(() => import('./pages/FraudReport'))
const CommunityStats = lazy(() => import('./pages/CommunityStats'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const ScamEducation = lazy(() => import('./pages/ScamEducation'))
const AIChat = lazy(() => import('./pages/AIChat'))

// Admin components
import AdminRoute from './components/AdminRoute'

function App() {
  return (
    <ErrorBoundary>
    <TranslationProvider>
    <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      {/* Public Routes */}
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      
      {/* Admin Routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route 
        path="/admin/dashboard" 
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        } 
      />
      <Route 
        path="/admin/users" 
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        } 
      />
      <Route 
        path="/admin/fraud-reports" 
        element={
          <AdminRoute>
            <AdminFraudReports />
          </AdminRoute>
        } 
      />
      <Route 
        path="/admin/ml-models" 
        element={
          <AdminRoute>
            <AdminMLModels />
          </AdminRoute>
        } 
      />
      <Route 
        path="/admin/system" 
        element={
          <AdminRoute>
            <AdminSystem />
          </AdminRoute>
        } 
      />
      
      {/* User Routes with Layout - Protected */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/recharge" element={<RechargePage />} />
        <Route path="/split" element={<SplitBillPage />} />
        <Route path="/request" element={<RequestMoneyPage />} />
        <Route path="/pay" element={<PaymentFlowV2 />} />
        <Route path="/risk/:transactionId" element={<RiskAssessment />} />
        <Route path="/history" element={<TransactionHistoryV2 />} />
        <Route path="/guardian" element={<GuardianMode />} />
        <Route path="/challenges" element={<Challenges />} />
        <Route path="/report" element={<FraudReport />} />
        <Route path="/community" element={<CommunityStats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/education/:scamType" element={<ScamEducation />} />
        <Route path="/ai-chat" element={<AIChat />} />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </TranslationProvider>
    </ErrorBoundary>
  )
}

export default App
