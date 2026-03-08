/**
 * TranslationContext — Full-page Groq AI translation system
 * ==========================================================
 * Provides `t(key, englishDefault)` to translate ANY UI string.
 * Caches translations per language in localStorage so Groq is only called once per page.
 * Also provides `speak(text)` for TTS in the selected regional language.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useUIStore } from '../store'
import { aiAPI } from '../api/client'

// ── Language metadata ──────────────────────────────────────────────────
export const LANG_MAP: Record<string, { name: string; native: string; bcp47: string }> = {
  en: { name: 'English', native: 'English', bcp47: 'en-IN' },
  hi: { name: 'Hindi', native: 'हिंदी', bcp47: 'hi-IN' },
  ta: { name: 'Tamil', native: 'தமிழ்', bcp47: 'ta-IN' },
  te: { name: 'Telugu', native: 'తెలుగు', bcp47: 'te-IN' },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  ml: { name: 'Malayalam', native: 'മലയാളം', bcp47: 'ml-IN' },
  mr: { name: 'Marathi', native: 'मराठी', bcp47: 'mr-IN' },
  bn: { name: 'Bengali', native: 'বাংলা', bcp47: 'bn-IN' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી', bcp47: 'gu-IN' },
  pa: { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN' },
  or: { name: 'Odia', native: 'ଓଡ଼ିଆ', bcp47: 'or-IN' },
  as: { name: 'Assamese', native: 'অসমীয়া', bcp47: 'as-IN' },
}

// ── Types ──────────────────────────────────────────────────────────────
interface TranslationContextValue {
  /** Translate a UI string. Returns translated text or english fallback. */
  t: (key: string, english: string) => string
  /** Register multiple strings to be translated in the next batch */
  register: (strings: Record<string, string>) => void
  /** Speak text aloud using browser TTS in the selected language */
  speak: (text: string) => void
  /** Speak an URGENT safety alert — ignores voiceAlertsEnabled, slower + louder */
  speakUrgent: (text: string) => void
  /** Stop any ongoing speech */
  stopSpeaking: () => void
  /** Whether speech is currently playing */
  isSpeaking: boolean
  /** Whether an urgent alert is currently being spoken */
  isUrgentSpeaking: boolean
  /** Whether translation is currently loading */
  isTranslating: boolean
  /** Current language code */
  language: string
  /** Current language info */
  langInfo: { name: string; native: string; bcp47: string }
  /** Force re-translate the current page's strings */
  refreshTranslations: () => void
}

const TranslationContext = createContext<TranslationContextValue | null>(null)

// ── Local cache helpers ────────────────────────────────────────────────
const CACHE_PREFIX = 'ui_translations_'

function getCachedTranslations(lang: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + lang)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setCachedTranslations(lang: string, translations: Record<string, string>) {
  try {
    // Merge with existing cache
    const existing = getCachedTranslations(lang)
    const merged = { ...existing, ...translations }
    localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(merged))
  } catch {
    // Storage full — clear old caches
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k)
    })
  }
}

// ── Provider ───────────────────────────────────────────────────────────
export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const { language, voiceAlertsEnabled } = useUIStore()
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isUrgentSpeaking, setIsUrgentSpeaking] = useState(false)

  // Pending strings that need translation (accumulated from t() calls)
  const pendingRef = useRef<Record<string, string>>({})
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchingRef = useRef(false)

  const langInfo = LANG_MAP[language] || LANG_MAP.en

  // Load cached translations when language changes
  useEffect(() => {
    if (language === 'en') {
      setTranslations({})
      return
    }
    const cached = getCachedTranslations(language)
    setTranslations(cached)
  }, [language])

  // Batch-fetch translations from Groq
  const fetchTranslations = useCallback(async (strings: Record<string, string>) => {
    if (language === 'en' || Object.keys(strings).length === 0) return
    if (fetchingRef.current) return
    
    fetchingRef.current = true
    setIsTranslating(true)

    try {
      // Filter out already-translated keys
      const cached = getCachedTranslations(language)
      const needed: Record<string, string> = {}
      for (const [key, val] of Object.entries(strings)) {
        if (!cached[key]) needed[key] = val
      }

      if (Object.keys(needed).length === 0) {
        setTranslations(prev => ({ ...prev, ...cached }))
        return
      }

      // Split into chunks of 50 (API limit is 60)
      const entries = Object.entries(needed)
      for (let i = 0; i < entries.length; i += 50) {
        const chunk = Object.fromEntries(entries.slice(i, i + 50))
        try {
          const res = await aiAPI.translateUI(chunk, language)
          if (res.data?.translations) {
            setCachedTranslations(language, res.data.translations)
            setTranslations(prev => ({ ...prev, ...res.data.translations }))
          }
        } catch (err) {
          console.warn('UI translation batch failed:', err)
        }
      }
    } finally {
      fetchingRef.current = false
      setIsTranslating(false)
    }
  }, [language])

  // Schedule a batch translate (debounced)
  const scheduleBatch = useCallback(() => {
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    batchTimerRef.current = setTimeout(() => {
      const pending = { ...pendingRef.current }
      pendingRef.current = {}
      if (Object.keys(pending).length > 0) {
        fetchTranslations(pending)
      }
    }, 150) // 150ms debounce — collect all t() calls from a render, then batch
  }, [fetchTranslations])

  // t() — the main translation function
  const t = useCallback((key: string, english: string): string => {
    if (language === 'en') return english

    // Return cached translation if available
    if (translations[key]) return translations[key]

    // Register for batch fetch
    pendingRef.current[key] = english
    scheduleBatch()

    // Return english as fallback until translation arrives
    return english
  }, [language, translations, scheduleBatch])

  // register() — pre-register strings for batch translation
  const register = useCallback((strings: Record<string, string>) => {
    if (language === 'en') return
    for (const [key, val] of Object.entries(strings)) {
      if (!translations[key]) {
        pendingRef.current[key] = val
      }
    }
    scheduleBatch()
  }, [language, translations, scheduleBatch])

  // refreshTranslations — force re-translate
  const refreshTranslations = useCallback(() => {
    if (language === 'en') return
    // Clear cache for current language and re-fetch
    localStorage.removeItem(CACHE_PREFIX + language)
    setTranslations({})
    // Collect all currently registered strings and re-fetch
    scheduleBatch()
  }, [language, scheduleBatch])

  // speak() — TTS in regional language (respects voiceAlertsEnabled)
  const speak = useCallback((text: string) => {
    if (!voiceAlertsEnabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langInfo.bcp47
    utterance.rate = 0.9
    utterance.pitch = 1.0
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => { setIsSpeaking(false); setIsUrgentSpeaking(false) }
    utterance.onerror = () => { setIsSpeaking(false); setIsUrgentSpeaking(false) }

    window.speechSynthesis.speak(utterance)
  }, [voiceAlertsEnabled, langInfo.bcp47])

  // speakUrgent() — ALWAYS speaks, even if voiceAlertsEnabled is off (critical safety alerts)
  const speakUrgent = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langInfo.bcp47
    utterance.rate = 0.82    // Slower for urgency & comprehension
    utterance.pitch = 1.1    // Slightly higher pitch for attention
    utterance.volume = 1.0   // Max volume
    utterance.onstart = () => { setIsSpeaking(true); setIsUrgentSpeaking(true) }
    utterance.onend = () => { setIsSpeaking(false); setIsUrgentSpeaking(false) }
    utterance.onerror = () => { setIsSpeaking(false); setIsUrgentSpeaking(false) }

    window.speechSynthesis.speak(utterance)
  }, [langInfo.bcp47])

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
    setIsUrgentSpeaking(false)
  }, [])

  return (
    <TranslationContext.Provider
      value={{
        t,
        register,
        speak,
        speakUrgent,
        stopSpeaking,
        isSpeaking,
        isUrgentSpeaking,
        isTranslating,
        language,
        langInfo,
        refreshTranslations,
      }}
    >
      {children}
    </TranslationContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────
export function useTranslation() {
  const ctx = useContext(TranslationContext)
  if (!ctx) throw new Error('useTranslation must be used within TranslationProvider')
  return ctx
}
