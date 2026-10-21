import { Shield } from 'lucide-react'

export default function LoadingSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary-500/30 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-gradient-to-br from-primary-500 to-primary-700 p-4 rounded-2xl shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
        </div>
        <p className="text-gray-600 font-medium">Loading...</p>
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}