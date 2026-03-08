/**
 * MyQRCode - Generate UPI QR Code for receiving payments
 * ======================================================
 * Generates a standard UPI QR code that can be scanned by any UPI app
 * Format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&tn=NOTE
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import {
  QrCode,
  X,
  IndianRupee,
  Copy,
  Check,
  Download,
  Share2,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface MyQRCodeProps {
  isOpen: boolean
  onClose: () => void
  upiId: string
  userName: string
}

export default function MyQRCode({ isOpen, onClose, upiId, userName }: MyQRCodeProps) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  const buildUPIString = () => {
    let upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(userName)}`
    if (amount && parseFloat(amount) > 0) {
      upiString += `&am=${parseFloat(amount).toFixed(2)}`
    }
    if (note.trim()) {
      upiString += `&tn=${encodeURIComponent(note.trim())}`
    }
    upiString += '&cu=INR'
    return upiString
  }

  const handleCopy = async () => {
    try {
      // navigator.clipboard requires HTTPS on mobile — use fallback
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(upiId)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = upiId
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopied(true)
      toast.success('UPI ID copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDownload = () => {
    const svg = document.getElementById('my-upi-qr')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const link = document.createElement('a')
        link.download = `upi-qr-${upiId.split('@')[0]}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
        toast.success('QR code downloaded!')
      }
    }

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pay ${userName}`,
          text: `Pay ${userName} via UPI: ${upiId}${amount ? ` - ₹${amount}` : ''}`,
          url: buildUPIString(),
        })
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-xl">
                <QrCode className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">My QR Code</h2>
                <p className="text-xs text-gray-500">Scan to pay me</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-2xl border-2 border-primary-100 shadow-inner">
              <QRCodeSVG
                id="my-upi-qr"
                value={buildUPIString()}
                size={200}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#1a1a2e"
              />
            </div>
          </div>

          {/* User Info */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-gray-900">{userName}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <span>{upiId}</span>
              <button onClick={handleCopy} className="text-primary-500 hover:text-primary-700">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Optional Amount */}
          <div className="space-y-3 mb-5">
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (optional)"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                min="1"
                max="500000"
              />
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              maxLength={50}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
