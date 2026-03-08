import { useState, useEffect, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, QrCode, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (data: { upiId: string; name?: string; amount?: string; note?: string }) => void
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [_scanning, setScanning] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setScanning(true)
      setPaused(false)
      // Camera requires HTTPS on mobile browsers
      if (!navigator.mediaDevices) {
        setHasPermission(false)
        setError('Camera access requires HTTPS. On mobile, use https:// or localhost.')
        return
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(() => setHasPermission(true))
        .catch(() => {
          setHasPermission(false)
          setError('Camera access denied. Please enable camera permissions in your browser settings.')
        })
    }
    return () => {
      setScanning(false)
      setPaused(true)
    }
  }, [isOpen])

  // Parse UPI QR code data
  // Format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&tn=NOTE
  const parseUPIString = (data: string): { upiId: string; name?: string; amount?: string; note?: string } | null => {
    try {
      // Handle direct UPI ID input
      if (data.includes('@') && !data.startsWith('upi://')) {
        return { upiId: data.trim() }
      }

      // Parse UPI URL format
      if (data.toLowerCase().startsWith('upi://pay')) {
        const url = new URL(data)
        const params = new URLSearchParams(url.search)
        
        const upiId = params.get('pa') || ''
        if (!upiId) return null

        return {
          upiId: upiId,
          name: params.get('pn') || undefined,
          amount: params.get('am') || undefined,
          note: params.get('tn') || params.get('cu') || undefined,
        }
      }

      return null
    } catch (e) {
      console.error('QR Parse error:', e)
      return null
    }
  }

  const handleScan = useCallback((result: any[]) => {
    if (!result || result.length === 0) return
    
    // The library passes an array of IDetectedBarcode objects
    // Each has: rawValue, format, boundingBox, cornerPoints
    const detected = result[0]
    const rawData = detected?.rawValue || detected?.getText?.() || ''
    
    if (!rawData) return
    
    console.log('[QRScanner] Detected:', rawData)
    
    const parsed = parseUPIString(rawData)
    if (parsed) {
      setPaused(true) // Stop scanning immediately
      setScanning(false)
      onScan(parsed)
      onClose()
    } else {
      setError('Invalid UPI QR code. Please scan a valid payment QR.')
    }
  }, [onScan, onClose])

  const handleError = useCallback((error: any) => {
    console.error('[QRScanner] Error:', error)
    // Don't show error for NotFoundError (no barcode found in frame - normal)
    if (error?.name === 'NotFoundError' || error?.message?.includes('No barcode')) return
    setError('Scanner error. Please try again or enter UPI ID manually.')
  }, [])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-xl">
              <QrCode className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Scan QR Code</h2>
              <p className="text-gray-400 text-xs">Point camera at UPI QR code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Scanner Area */}
        <div className="flex-1 relative flex items-center justify-center p-4">
          {hasPermission === false ? (
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-danger-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-danger-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Camera Access Required</h3>
              <p className="text-gray-400 text-sm mb-4">
                Please enable camera permissions in your browser settings to scan QR codes.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                Close
              </button>
            </div>
          ) : hasPermission === null ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Requesting camera access...</p>
            </div>
          ) : (
            <div className="relative w-full max-w-sm aspect-square">
              {/* Scanner */}
              <div className="w-full h-full rounded-3xl overflow-hidden">
                <Scanner
                  onScan={handleScan}
                  onError={handleError}
                  formats={['qr_code']}
                  paused={paused}
                  scanDelay={300}
                  allowMultiple={false}
                  constraints={{
                    facingMode: 'environment',
                    width: { min: 640, ideal: 1280 },
                    height: { min: 480, ideal: 720 },
                  }}
                  components={{
                    torch: false,
                    finder: false,
                  }}
                  styles={{
                    container: { width: '100%', height: '100%' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' },
                  }}
                />
              </div>
              
              {/* Overlay Frame */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary-400 rounded-tl-3xl" />
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary-400 rounded-tr-3xl" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary-400 rounded-bl-3xl" />
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary-400 rounded-br-3xl" />
                
                {/* Scanning line animation */}
                <motion.div
                  className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mb-4 p-4 bg-danger-500/20 border border-danger-500/30 rounded-2xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-danger-300 text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-danger-400 text-xs mt-1 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}

        {/* Instructions */}
        <div className="p-4 bg-black/50">
          <div className="flex items-center justify-center gap-6 text-gray-400 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success-400" />
              <span>GPay QR</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success-400" />
              <span>PhonePe QR</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success-400" />
              <span>Paytm QR</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
