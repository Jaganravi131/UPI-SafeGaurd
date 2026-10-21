/**
 * OTP Service — thin client over the backend's server-side OTP store
 * =================================================================
 * OTPs are generated, persisted, verified and consumed entirely on the
 * backend (Redis with SQLite fallback). This mirrors Google Pay's model:
 * the browser never owns OTP state, so OTPs survive page refreshes and
 * cannot be tampered with client-side.
 *
 *  - `sendOTP(email)`   → POST /auth/request-otp
 *  - `verifyOTP(email)` → POST /auth/verify-otp (returns the auth session)
 *
 * Dev mode: the backend exposes a demo OTP in the response and logs it
 * server-side. Production: email delivery happens on the server via SMTP.
 */

import { authAPI } from '../api/client'
import type { User } from '../store'

export interface OTPConfig {
  mode: 'development' | 'production'
  otpLength?: number
  otpExpiryMinutes?: number
}

const config: OTPConfig = {
  mode: (import.meta.env.VITE_OTP_MODE as 'development' | 'production') || 'development',
  otpLength: 6,
  otpExpiryMinutes: 5,
}

export interface SendOTPResult {
  success: boolean
  message?: string
  /** Only present in development/demo mode, so the UI can autofill */
  devOtp?: string
  expiresInSeconds?: number
  deliveryMethod?: string
}

export interface VerifyOTPResult {
  success: boolean
  message?: string
  /** Auth session payload returned by the backend on successful verification */
  auth?: {
    /** Empty for new users until registration completes */
    access_token: string
    user: User | null
    is_new_user: boolean
    suggested_name?: string
    firebase_uid?: string
  }
}

// Request an OTP — generated and persisted server-side
export async function sendOTP(email: string): Promise<SendOTPResult> {
  try {
    const response = await authAPI.requestOTP(email)
    const data = response.data || {}

    if (data.success === false) {
      return { success: false, message: data.message || 'Failed to send OTP' }
    }

    const devOtp: string | undefined = data.demo_otp || data.otp
    if (devOtp && config.mode === 'development') {
      console.log('🔐 Development mode - backend demo OTP:', devOtp)
    }

    return {
      success: true,
      message: data.message || 'OTP sent. Check your email or the server log in development.',
      devOtp,
      expiresInSeconds: data.expires_in,
      deliveryMethod: data.delivery_method,
    }
  } catch (error: any) {
    console.error('OTP request failed:', error)
    return {
      success: false,
      message: error.response?.data?.detail || error.message || 'Failed to send OTP. Please try again.',
    }
  }
}

// Verify an OTP — single server-side verification that also logs the user in
export async function verifyOTP(email: string, otp: string): Promise<VerifyOTPResult> {
  try {
    const response = await authAPI.verifyOTP(email, otp)
    const data = response.data || {}

    // New users verify the OTP but have no token yet — registration follows
    if (!data.is_new_user && !data.access_token) {
      return { success: false, message: data.message || 'Invalid or expired OTP' }
    }

    return {
      success: true,
      message: data.is_new_user ? 'Email verified successfully!' : 'Welcome back!',
      auth: {
        access_token: data.access_token || '',
        user: data.user ?? null,
        is_new_user: !!data.is_new_user,
        suggested_name: data.suggested_name,
        firebase_uid: data.firebase_uid,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        'Invalid OTP. Please try again.',
    }
  }
}

// Kept for backwards compatibility with any test code importing it
export function generateOTP(length: number = 6): string {
  const digits = '0123456789'
  let otp = ''
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)]
  }
  return otp
}

export function setOTPConfig(newConfig: Partial<OTPConfig>) {
  Object.assign(config, newConfig)
}

export function getOTPConfig(): OTPConfig {
  return { ...config }
}
