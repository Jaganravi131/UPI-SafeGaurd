import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Send,
  Bot,
  User,
  Globe,
  Shield,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Lightbulb,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useUIStore } from '../store'
import { aiAPI } from '../api/client'
import toast from 'react-hot-toast'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_PROMPTS = [
  'How can I identify a UPI scam?',
  'What should I do if I shared my OTP?',
  'How do SIM swap attacks work?',
  'Is it safe to scan QR codes from strangers?',
  'How to protect my elderly parents from fraud?',
  'What are the latest UPI fraud trends?',
]

// BCP-47 locale codes for Web Speech API (voice input/output)
const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  as: 'as-IN',
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mr', name: 'मराठी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'ଓଡ଼ିଆ' },
  { code: 'as', name: 'অসমীয়া' },
]

export default function AIChat() {
  const { language } = useUIStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatLanguage, setChatLanguage] = useState(language || 'en')
  const [showLanguagePicker, setShowLanguagePicker] = useState(false)
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(SUGGESTED_PROMPTS)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Voice Input (Speech-to-Text) state ──────────────────────────
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // ── Voice Output (Text-to-Speech) state ─────────────────────────
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setChatLanguage(language || 'en')
  }, [language])

  // ── Fetch localized prompts when language changes ───────────────
  useEffect(() => {
    const fetchPrompts = async () => {
      if (chatLanguage === 'en') {
        setSuggestedPrompts(SUGGESTED_PROMPTS)
        return
      }
      try {
        const res = await aiAPI.getSuggestedPrompts(chatLanguage)
        if (res.data.prompts?.length) {
          setSuggestedPrompts(res.data.prompts)
        }
      } catch {
        // keep current prompts on error
      }
    }
    fetchPrompts()
  }, [chatLanguage])

  // ── Voice Input: SpeechRecognition setup ────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error('Voice input not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = LANG_TO_BCP47[chatLanguage] || 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = (event: any) => {
      setIsListening(false)
      recognitionRef.current = null
      if (event.error !== 'aborted') {
        toast.error(`Voice error: ${event.error}`)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [chatLanguage])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  // ── Clean text for speech (strip markdown, URLs, special chars) ─
  const cleanTextForSpeech = useCallback((raw: string): string => {
    let text = raw
    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    text = text.replace(/`([^`]*)`/g, '$1')
    // Remove markdown bold/italic markers
    text = text.replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    text = text.replace(/_{1,3}(.*?)_{1,3}/g, '$1')
    // Remove markdown headings
    text = text.replace(/^#{1,6}\s+/gm, '')
    // Remove markdown links — keep link text
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove standalone URLs
    text = text.replace(/https?:\/\/[^\s)]+/g, '')
    // Remove bullet markers
    text = text.replace(/^[\s]*[-*•]\s+/gm, '')
    // Remove numbered list markers
    text = text.replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}$/gm, '')
    // Collapse multiple newlines
    text = text.replace(/\n{3,}/g, '\n\n')
    // Trim
    return text.trim()
  }, [])

  // ── Voice Output: SpeechSynthesis ───────────────────────────────
  const speakText = useCallback((text: string, messageIndex: number) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Text-to-speech not supported in this browser')
      return
    }

    // If already speaking this message, stop
    if (speakingIdx === messageIndex) {
      window.speechSynthesis.cancel()
      setSpeakingIdx(null)
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const cleaned = cleanTextForSpeech(text)
    const utterance = new SpeechSynthesisUtterance(cleaned)
    utterance.lang = LANG_TO_BCP47[chatLanguage] || 'en-IN'
    utterance.rate = 0.9
    utterance.pitch = 1

    // Try to find a voice matching the language
    const voices = window.speechSynthesis.getVoices()
    const langPrefix = LANG_TO_BCP47[chatLanguage]?.split('-')[0] || 'en'
    const matchingVoice = voices.find(v => v.lang.startsWith(langPrefix))
    if (matchingVoice) {
      utterance.voice = matchingVoice
    }

    utterance.onstart = () => setSpeakingIdx(messageIndex)
    utterance.onend = () => setSpeakingIdx(null)
    utterance.onerror = () => setSpeakingIdx(null)

    window.speechSynthesis.speak(utterance)
  }, [chatLanguage, speakingIdx, cleanTextForSpeech])

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      recognitionRef.current?.stop()
    }
  }, [])

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await aiAPI.chat({
        message: messageText,
        language: chatLanguage,
        conversation_history: conversationHistory,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data.reply || response.data.response || response.data.message || 'I apologize, I could not process your request.',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      console.error('AI Chat error:', error)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
      toast.error('Failed to get AI response')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-h-[800px] w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-2 mb-4"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl blur-lg opacity-30 animate-pulse" />
            <div className="relative bg-gradient-to-br from-violet-500 to-indigo-600 p-2.5 rounded-xl shadow-lg">
              <Bot className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-violet-700 to-indigo-600 bg-clip-text text-transparent truncate">
              AI Scam Advisor
            </h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">Powered by Groq LLaMA 3.3</span>
            </div>
          </div>
        </div>

        {/* Language Selector */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowLanguagePicker(!showLanguagePicker)}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 hover:border-primary-300 transition-all max-w-[140px]"
          >
            <Globe className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 truncate">
              {LANGUAGES.find(l => l.code === chatLanguage)?.name || 'English'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${showLanguagePicker ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showLanguagePicker && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-50 max-h-60 overflow-y-auto"
              >
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setChatLanguage(lang.code)
                      setShowLanguagePicker(false)
                      toast.success(`Chat language: ${lang.name}`)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 transition-colors ${
                      chatLanguage === lang.code ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Chat Area */}
      <div className="flex-1 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center px-4"
            >
              <div className="bg-gradient-to-br from-violet-100 to-indigo-100 p-6 rounded-3xl mb-6">
                <Shield className="w-12 h-12 text-violet-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                Your AI Fraud Protection Advisor
              </h2>
              <p className="text-sm text-gray-500 mb-4 max-w-xs sm:max-w-sm px-2">
                Ask me anything about UPI fraud, scam prevention, or digital payment safety. I respond in your preferred language.
              </p>
              {/* Voice & Language hint */}
              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-violet-50 rounded-xl">
                <Mic className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <span className="text-xs text-violet-700">
                  Tap the mic to speak in Hindi, Tamil, Marathi, or any language. Tap 🔊 to listen to replies.
                </span>
              </div>

              {/* Suggested Prompts */}
              <div className="w-full max-w-sm sm:max-w-md space-y-2 px-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5 justify-center mb-3">
                  <Lightbulb className="w-3.5 h-3.5" /> Suggested Questions
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {suggestedPrompts.map((prompt, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => sendMessage(prompt)}
                      className="text-left px-3 py-3 bg-white/80 hover:bg-primary-50 border border-gray-100 hover:border-primary-200 rounded-xl text-sm text-gray-700 hover:text-primary-700 transition-all group"
                    >
                      <span className="flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                        {prompt}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center mt-1">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="max-w-[85%] sm:max-w-[80%] flex flex-col">
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-words ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words overflow-hidden">{msg.content}</div>
                      <div className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-primary-200' : 'text-gray-400'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {/* Voice Output button for assistant messages */}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => speakText(msg.content, i)}
                        className={`self-start mt-1 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all ${
                          speakingIdx === i
                            ? 'bg-violet-100 text-violet-700'
                            : 'text-gray-400 hover:text-violet-600 hover:bg-gray-50'
                        }`}
                        title={speakingIdx === i ? 'Stop speaking' : 'Listen to this message'}
                      >
                        {speakingIdx === i ? (
                          <><VolumeX className="w-3 h-3" /> Stop</>
                        ) : (
                          <><Volume2 className="w-3 h-3" /> Listen</>
                        )}
                      </button>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center mt-1">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Typing Indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 items-start"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span className="text-sm text-gray-500">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-100 p-3 bg-white/80">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 relative min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? `🎤 Listening in ${LANGUAGES.find(l => l.code === chatLanguage)?.name || 'English'}...` : 'Ask about UPI fraud, scams, safety...'}
                className={`w-full px-4 py-3 bg-gray-50 rounded-xl border focus:ring-2 focus:ring-primary-100 outline-none text-sm transition-all ${
                  isListening ? 'border-red-400 bg-red-50/30 animate-pulse' : 'border-gray-200 focus:border-primary-400'
                }`}
                disabled={isLoading}
              />
              {chatLanguage !== 'en' && !isListening && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-[10px] px-2 py-0.5 bg-primary-100 text-primary-600 rounded-full font-medium">
                    {LANGUAGES.find(l => l.code === chatLanguage)?.name}
                  </span>
                </div>
              )}
            </div>
            {/* Microphone button for voice input */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isListening ? stopListening : startListening}
              className={`p-3 rounded-xl transition-all ${
                isListening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600'
              }`}
              title={isListening ? 'Stop listening' : `Speak in ${LANGUAGES.find(l => l.code === chatLanguage)?.name || 'English'}`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={`p-3 rounded-xl transition-all ${
                input.trim() && !isLoading
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Safety Disclaimer */}
          <div className="flex items-center gap-1.5 justify-center mt-2">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-gray-400">
              AI advisor for educational purposes. Always verify with official sources.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
