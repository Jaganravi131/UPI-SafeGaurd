import { Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import { TranslationProvider } from './contexts/TranslationContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PaymentFlowV2 from './pages/PaymentFlowV2'
import RiskAssessment from './pages/RiskAssessment'
import TransactionHistory from './pages/TransactionHistory'
import GuardianMode from './pages/GuardianMode'
import Challenges from './pages/Challenges'
import FraudReport from './pages/FraudReport'
import CommunityStats from './pages/CommunityStats'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import ScamEducation from './pages/ScamEducation'
import AIChat from './pages/AIChat'

// Admin Pages
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'
import AdminFraudReports from './pages/AdminFraudReports'
import AdminMLModels from './pages/AdminMLModels'
import AdminSystem from './pages/AdminSystem'
import AdminRoute from './components/AdminRoute'
import NotFound from './pages/NotFound'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'

function App() {
  return (
    <ErrorBoundary>
    <TranslationProvider>
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pay" element={<PaymentFlowV2 />} />
        <Route path="/risk/:transactionId" element={<RiskAssessment />} />
        <Route path="/history" element={<TransactionHistory />} />
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
    </TranslationProvider>
    </ErrorBoundary>
  )
}

export default App
