import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Shield } from 'lucide-react'

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary-600 text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
        </div>
        <p className="text-gray-500 text-sm">Last updated: January 2025</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="card space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
          <p>UPI SafeGuard collects the following information to provide fraud detection services:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
            <li>Phone number (for authentication via OTP)</li>
            <li>Transaction metadata (recipient UPI, amount, timestamp) — used only for real-time risk assessment</li>
            <li>Device sensor data (gyroscope, accelerometer) — used anonymously for coercion detection</li>
            <li>Fraud reports you voluntarily submit</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Your Data</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Real-time fraud risk assessment using our 5-model ML ensemble</li>
            <li>Behavioral profiling to establish your normal transaction patterns</li>
            <li>Community fraud database to warn users about known scammers</li>
            <li>Guardian mode notifications to approved family members</li>
            <li>Anonymized and aggregated analytics to improve our models</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Data Storage & Security</h2>
          <p className="text-sm">All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Database access is restricted via role-based access controls. We use PostgreSQL with row-level security and Redis for ephemeral session data. ML model inference happens server-side; no raw transaction data leaves our infrastructure.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Retention</h2>
          <p className="text-sm">Transaction risk assessments are retained for 90 days. Fraud reports are retained indefinitely to protect the community. You may request deletion of your personal data at any time by contacting support.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Third-Party Sharing</h2>
          <p className="text-sm">We do not sell your data. We may share anonymized fraud intelligence with law enforcement agencies and NPCI (National Payments Corporation of India) upon lawful request. Firebase is used for phone authentication only.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Your Rights</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Access: Request a copy of your personal data</li>
            <li>Correction: Update incorrect information</li>
            <li>Deletion: Request removal of your account and data</li>
            <li>Portability: Export your transaction history</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Contact</h2>
          <p className="text-sm">For privacy-related inquiries, email <span className="text-primary-600">privacy@upisafeguard.in</span></p>
        </section>
      </motion.div>
    </div>
  )
}
