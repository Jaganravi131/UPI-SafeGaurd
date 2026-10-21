import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, IndianRupee, X, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { walletAPI } from '../api/client'
import { useAuthStore } from '../store'

const QUICK_AMOUNTS = [100, 500, 1000, 2000]
const MAX_TOPUP = 10000

/**
 * Sandbox "Add Money" — credits the user's wallet so payments to other
 * users work like a funded UPI account. All accounts start at Rs.0.
 */
export default function AddMoneyModal({
  open,
  onClose,
  onTopUp,
}: {
  open: boolean
  onClose: () => void
  onTopUp?: (newBalance: number) => void
}) {
  const { user, setAuth } = useAuthStore()
  const [amount, setAmount] = useState<number>(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const handleTopUp = async () => {
    if (!user?.id || amount <= 0) return
    setLoading(true)
    try {
      const response = await walletAPI.topUp(user.id, amount)
      const newBalance = response.data.balance
      // Keep the store in sync by re-issuing the same user
      setAuth(localStorage.getItem('token') || '', user)
      toast.success(`₹${amount.toLocaleString('en-IN')} added to your wallet!`)
      onTopUp?.(newBalance)
      setAmount(0)
      setSelected(null)
      onClose()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Add Money failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const pick = (value: number) => {
    setSelected(value)
    setAmount(value)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Add Money
              </h2>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Sandbox banking — credit your demo wallet (max ₹{MAX_TOPUP.toLocaleString('en-IN')} per top-up).
            </p>

            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  key={v}
                  onClick={() => pick(v)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                    selected === v
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                  }`}
                >
                  ₹{v.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="relative mb-4">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="number"
                min={1}
                max={MAX_TOPUP}
                value={amount || ''}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setAmount(v > MAX_TOPUP ? MAX_TOPUP : v)
                  setSelected(null)
                }}
                placeholder="Custom amount"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-gray-900"
              />
            </div>

            <button
              onClick={handleTopUp}
              disabled={loading || amount <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Add {amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : 'Money'}
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
