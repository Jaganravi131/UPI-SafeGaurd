import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Ban,
  CheckCircle,
  RefreshCw,
  Filter,
  Download,
  Save,
  X
} from 'lucide-react'
import { adminAPI } from '../api/client'
import toast from 'react-hot-toast'

interface User {
  id: string
  phone_number: string
  full_name: string
  email?: string
  security_score: number
  digital_literacy: string
  guardian_enabled: boolean
  created_at: string
  last_login?: string
  transaction_count: number
  is_active: boolean
}

export default function AdminUsers() {
  const navigate = useNavigate()
  
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '', digital_literacy: 'intermediate', daily_limit: 50000, per_transaction_limit: 25000 })
  const [showFilters, setShowFilters] = useState(false)
  const [filterLiteracy, setFilterLiteracy] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const pageSize = 10

  useEffect(() => {
    fetchUsers()
  }, [currentPage, searchQuery])

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const response = await adminAPI.getUsers(currentPage, pageSize, searchQuery)
      setUsers(response.data?.users || [])
      setTotalPages(response.data?.total_pages || 1)
    } catch (error) {
      console.error('Failed to fetch users:', error)
      toast.error('Failed to load users')
      setUsers([])
      setTotalPages(1)
    } finally {
      setIsLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-500/20'
    if (score >= 60) return 'text-yellow-400 bg-yellow-500/20'
    if (score >= 40) return 'text-orange-400 bg-orange-500/20'
    return 'text-red-400 bg-red-500/20'
  }

  const getLiteracyBadge = (level: string) => {
    const colors: Record<string, string> = {
      beginner: 'bg-blue-500/20 text-blue-400',
      intermediate: 'bg-purple-500/20 text-purple-400',
      advanced: 'bg-green-500/20 text-green-400'
    }
    return colors[level] || colors.beginner
  }

  const handleViewUser = (user: User) => {
    setSelectedUser(user)
    setShowModal(true)
  }

  const handleUpdateSecurityScore = async (userId: string, newScore: number) => {
    try {
      await adminAPI.updateUserSecurityScore(userId, newScore)
      toast.success('Security score updated')
      fetchUsers()
      setShowModal(false)
    } catch (error) {
      console.error('Failed to update security score:', error)
      toast.error('Failed to update security score')
    }
  }

  const handleToggleStatus = async (userId: string, currentlyActive: boolean) => {
    try {
      await adminAPI.updateUserStatus(userId, !currentlyActive)
      toast.success(`User ${currentlyActive ? 'deactivated' : 'activated'}`)
      fetchUsers()
    } catch (error) {
      console.error('Failed to update user status:', error)
      toast.error('Failed to update user status')
    }
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await adminAPI.exportUsers(format)
      const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users_export.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (err) {
      toast.error('Export failed')
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      digital_literacy: user.digital_literacy || 'intermediate',
      daily_limit: 50000,
      per_transaction_limit: 25000,
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    try {
      await adminAPI.editUser(editingUser.id, editForm)
      toast.success('User updated')
      setShowEditModal(false)
      fetchUsers()
    } catch (err) {
      toast.error('Failed to update user')
    }
  }

  // Client-side filtering
  const filteredUsers = users.filter(u => {
    if (filterLiteracy && u.digital_literacy !== filterLiteracy) return false
    if (filterStatus === 'active' && !u.is_active) return false
    if (filterStatus === 'inactive' && u.is_active) return false
    return true
  })

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
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">User Management</h1>
                <p className="text-gray-400 text-sm">View and manage platform users</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchUsers}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
              >
                <Download className="w-4 h-4" />
                JSON
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
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-all ${(filterLiteracy || filterStatus) ? 'bg-blue-500/20' : 'bg-white/5'}`}
            >
              <Filter className="w-5 h-5" />
              Filters {(filterLiteracy || filterStatus) ? '●' : ''}
            </button>
            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-white/10 rounded-xl p-4 z-20 shadow-lg space-y-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Digital Literacy</label>
                  <select value={filterLiteracy} onChange={e => setFilterLiteracy(e.target.value)} className="w-full bg-white/10 text-white border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <option value="">All</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-white/10 text-white border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <button onClick={() => { setFilterLiteracy(''); setFilterStatus(''); setShowFilters(false) }} className="w-full text-center text-sm text-blue-400 hover:text-blue-300">Clear Filters</button>
              </div>
            )}
          </div>
        </div>

        {/* Users Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Security Score</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Level</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Guardian</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
                      <p className="text-gray-400">Loading users...</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {(user.full_name || 'U').charAt(0)}
                          </div>
                          <div>
                            <p className="text-white font-medium">{user.full_name}</p>
                            <p className="text-gray-500 text-sm">{user.transaction_count} transactions</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white text-sm">{user.phone_number}</p>
                        <p className="text-gray-500 text-xs">{user.email || 'No email'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(user.security_score)}`}>
                          {user.security_score}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getLiteracyBadge(user.digital_literacy)}`}>
                          {user.digital_literacy}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.guardian_enabled ? (
                          <span className="flex items-center gap-1 text-green-400 text-sm">
                            <Shield className="w-4 h-4" />
                            Enabled
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">Disabled</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(user.id, user.is_active)}
                          title={user.is_active ? 'Click to deactivate' : 'Click to activate'}
                          className="cursor-pointer"
                        >
                          {user.is_active ? (
                            <span className="flex items-center gap-1 text-green-400 text-sm hover:text-green-300 transition-colors">
                              <CheckCircle className="w-4 h-4" />
                              Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-sm hover:text-red-300 transition-colors">
                              <Ban className="w-4 h-4" />
                              Inactive
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewUser(user)}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="Edit User"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-gray-400 text-sm">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      {/* User Detail Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-white/10"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">User Details</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  {(selectedUser.full_name || 'U').charAt(0)}
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-white">{selectedUser.full_name}</h4>
                  <p className="text-gray-400">{selectedUser.phone_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-gray-500 text-sm">Security Score</p>
                  <p className={`text-lg font-bold ${selectedUser.security_score >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedUser.security_score}/100
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Digital Literacy</p>
                  <p className="text-white capitalize">{selectedUser.digital_literacy}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Guardian Mode</p>
                  <p className={selectedUser.guardian_enabled ? 'text-green-400' : 'text-gray-400'}>
                    {selectedUser.guardian_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Transactions</p>
                  <p className="text-white">{selectedUser.transaction_count}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Joined</p>
                  <p className="text-white">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Last Login</p>
                  <p className="text-white">{selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleDateString() : 'Never'}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => handleUpdateSecurityScore(selectedUser.id, selectedUser.security_score + 10)}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                >
                  Boost Score +10
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-white/10"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Edit User</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Full Name</label>
                <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Email</label>
                <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Digital Literacy</label>
                <select value={editForm.digital_literacy} onChange={e => setEditForm(f => ({ ...f, digital_literacy: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Daily Limit (₹)</label>
                  <input type="number" value={editForm.daily_limit} onChange={e => setEditForm(f => ({ ...f, daily_limit: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Per Txn Limit (₹)</label>
                  <input type="number" value={editForm.per_transaction_limit} onChange={e => setEditForm(f => ({ ...f, per_transaction_limit: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all">Cancel</button>
                <button onClick={handleSaveEdit} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
