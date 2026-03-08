import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FileText } from 'lucide-react'

export default function TermsOfService() {
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary-600 text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Terms of Service</h1>
        </div>
        <p className="text-gray-500 text-sm">Last updated: January 2025</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="card space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
          <p className="text-sm">By accessing or using UPI SafeGuard ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2>
          <p className="text-sm">UPI SafeGuard is an AI-powered fraud detection and prevention platform for UPI transactions. The Service provides real-time risk assessment, community fraud reporting, guardian mode for vulnerable users, and security education through gamified challenges.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. User Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Provide accurate information in fraud reports</li>
            <li>Do not submit false or malicious fraud reports</li>
            <li>Maintain the confidentiality of your account credentials</li>
            <li>Do not attempt to circumvent security measures</li>
            <li>Use the Service in compliance with applicable Indian laws</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Fraud Detection Disclaimer</h2>
          <p className="text-sm">Our ML models provide probabilistic risk assessments, not guarantees. While we strive for high accuracy (94%+ on known fraud patterns), no system can detect all fraud. UPI SafeGuard is a supplementary security layer and does not replace official bank security measures. We are not liable for financial losses from transactions you choose to proceed with despite warnings.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Guardian Mode</h2>
          <p className="text-sm">Guardian mode enables designated family members to review high-risk transactions. By enabling this feature, you consent to sharing transaction details (amount, recipient, risk score) with your approved guardians. Guardians must also accept these terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Community Reports</h2>
          <p className="text-sm">Fraud reports submitted by users are community-sourced. While we verify reports using AI and manual review, we do not guarantee the accuracy of all community-contributed data. Falsely reporting a legitimate UPI ID is a violation and may result in account suspension.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Intellectual Property</h2>
          <p className="text-sm">All ML models, algorithms, datasets, and platform code are proprietary to UPI SafeGuard. You may not reverse-engineer, decompile, or attempt to extract the models or training data.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Service Availability</h2>
          <p className="text-sm">We aim for 99.9% uptime but do not guarantee uninterrupted service. Scheduled maintenance windows will be communicated in advance. During outages, standard bank security measures remain your primary protection.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Termination</h2>
          <p className="text-sm">We may suspend or terminate your account for violations of these terms, abuse of the reporting system, or any activity that compromises platform integrity. You may delete your account at any time through Settings.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Governing Law</h2>
          <p className="text-sm">These Terms are governed by the laws of India. Any disputes shall be resolved in the courts of New Delhi, India.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Contact</h2>
          <p className="text-sm">For questions about these Terms, email <span className="text-primary-600">legal@upisafeguard.in</span></p>
        </section>
      </motion.div>
    </div>
  )
}
