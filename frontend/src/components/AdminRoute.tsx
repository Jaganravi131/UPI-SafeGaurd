import { Navigate, useLocation } from 'react-router-dom'
import { useAdminStore } from '../store'

interface AdminRouteProps {
  children: React.ReactNode
  allowedRoles?: ('super_admin' | 'admin' | 'analyst' | 'support')[]
}

export default function AdminRoute({ children, allowedRoles }: AdminRouteProps) {
  const { isAdminAuthenticated, admin } = useAdminStore()
  const location = useLocation()

  // Not authenticated - redirect to admin login
  if (!isAdminAuthenticated || !admin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  // Check role permissions if specified
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(admin.role)) {
      // User doesn't have required role - redirect to dashboard with limited access
      return <Navigate to="/admin/dashboard" replace />
    }
  }

  return <>{children}</>
}
