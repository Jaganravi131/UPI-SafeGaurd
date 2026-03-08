/**
 * LanguageBar — Floating language selector + voice readout controls
 * =================================================================
 * Shows on every authenticated page. Lets user:
 *   1. Switch language instantly (dropdown)
 *   2. Listen to the current page read aloud (TTS)
 *   3. See translation loading state
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Volume2, VolumeX, ChevronDown, Loader2, X } from 'lucide-react'
import { useUIStore } from '../store'
import { useTranslation, LANG_MAP } from '../contexts/TranslationContext'

export default function LanguageBar() {
  const { language, setLanguage } = useUIStore()
  const { isSpeaking, isUrgentSpeaking, isTranslating, speak, stopSpeaking, langInfo } = useTranslation()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleVoice = () => {
    if (isSpeaking) {
      stopSpeaking()
      return
    }
    // Collect all visible text on the page and speak it
    const mainContent = document.querySelector('main')
    if (!mainContent) return
    const text = mainContent.innerText?.slice(0, 2000) || '' // Limit to ~2000 chars
    if (text.trim()) {
      speak(text)
    }
  }

  const langs = Object.entries(LANG_MAP)

  return (
    <div className="fixed top-[76px] right-3 z-[60] flex items-center gap-1.5" ref={dropdownRef}>
      {/* Translation loading indicator */}
      <AnimatePresence>
        {isTranslating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-1 px-2 py-1.5 bg-primary-50 border border-primary-200 rounded-xl text-xs text-primary-600"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Translating…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice read-aloud button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleVoice}
        className={`relative p-2 rounded-xl shadow-lg border transition-all duration-200 ${
          isUrgentSpeaking
            ? 'bg-red-500 text-white border-red-600 shadow-red-500/40 animate-pulse'
            : isSpeaking
              ? 'bg-primary-500 text-white border-primary-600 shadow-primary-500/30'
              : 'bg-white/90 backdrop-blur-sm text-gray-600 border-white/60 hover:bg-primary-50 hover:text-primary-600'
        }`}
        title={isSpeaking ? 'Stop reading' : 'Read page aloud'}
      >
        {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        {isUrgentSpeaking && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-ping" />
        )}
      </motion.button>

      {/* Language selector */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-white/60 text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-all duration-200"
      >
        <Globe className="w-4 h-4" />
        <span className="max-w-[60px] truncate">{langInfo.native}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1.5 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</span>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded-lg hover:bg-gray-100">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {langs.map(([code, info]) => (
                <button
                  key={code}
                  onClick={() => {
                    setLanguage(code)
                    setOpen(false)
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-primary-50 transition-colors ${
                    language === code ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{info.native}</span>
                    <span className="text-[10px] text-gray-400">{info.name}</span>
                  </div>
                  {language === code && (
                    <div className="w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
