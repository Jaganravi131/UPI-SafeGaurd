/**
 * Firebase Configuration
 * ======================
 * Used for Phone Authentication (OTP)
 */
import { initializeApp } from 'firebase/app'
import { 
  getAuth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth'

// Firebase configuration - You need to get these from Firebase Console
// Go to: Firebase Console > Project Settings > General > Your apps > Web app
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "upi-fruad-detection.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "upi-fruad-detection",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "upi-fruad-detection.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

// Store confirmation result globally
let confirmationResult: ConfirmationResult | null = null

/**
 * Setup reCAPTCHA verifier for phone auth
 * Must be called before sending OTP
 */
export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  // Clear any existing verifier
  if ((window as any).recaptchaVerifier) {
    (window as any).recaptchaVerifier.clear()
  }
  
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA solved')
    },
    'expired-callback': () => {
      console.log('reCAPTCHA expired')
    }
  })
  
  ;(window as any).recaptchaVerifier = verifier
  return verifier
}

/**
 * Send OTP to phone number
 * @param phoneNumber - Phone number with country code (e.g., +919876543210)
 * @returns true if OTP sent successfully
 */
export async function sendOTP(phoneNumber: string): Promise<boolean> {
  try {
    // Ensure phone number has country code
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+91${phoneNumber}` // Default to India
    
    // Get or create reCAPTCHA verifier
    let verifier = (window as any).recaptchaVerifier
    if (!verifier) {
      // Create a hidden div for reCAPTCHA
      let recaptchaContainer = document.getElementById('recaptcha-container')
      if (!recaptchaContainer) {
        recaptchaContainer = document.createElement('div')
        recaptchaContainer.id = 'recaptcha-container'
        document.body.appendChild(recaptchaContainer)
      }
      verifier = setupRecaptcha('recaptcha-container')
    }
    
    // Send OTP
    confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier)
    console.log('✅ OTP sent to', formattedPhone)
    return true
  } catch (error: any) {
    console.error('❌ Failed to send OTP:', error)
    
    // Reset reCAPTCHA on error
    if ((window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier.clear()
      ;(window as any).recaptchaVerifier = null
    }
    
    throw new Error(error.message || 'Failed to send OTP')
  }
}

/**
 * Verify OTP and get Firebase ID token
 * @param otp - 6-digit OTP code
 * @returns Firebase ID token for backend verification
 */
export async function verifyOTP(otp: string): Promise<string> {
  if (!confirmationResult) {
    throw new Error('Please request OTP first')
  }
  
  try {
    const result = await confirmationResult.confirm(otp)
    const idToken = await result.user.getIdToken()
    console.log('✅ OTP verified, user:', result.user.phoneNumber)
    return idToken
  } catch (error: any) {
    console.error('❌ OTP verification failed:', error)
    throw new Error(error.code === 'auth/invalid-verification-code' 
      ? 'Invalid OTP. Please try again.' 
      : error.message || 'OTP verification failed')
  }
}

/**
 * Get current user's ID token (for API calls)
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  await auth.signOut()
  confirmationResult = null
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return auth.currentUser
}

export { auth }
