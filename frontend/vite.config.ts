import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react', 'clsx', 'tailwind-merge'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['axios', 'zustand', 'react-hot-toast', 'date-fns'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html2canvas'],
          'vendor-qr': ['qrcode.react', '@yudiel/react-qr-scanner'],
          'vendor-ai': ['@tanstack/react-query'],
          // Feature chunks - lazy loaded routes
          'feature-auth': ['./src/pages/Login', './src/pages/Landing'],
          'feature-home': ['./src/pages/HomeScreen', './src/pages/Dashboard'],
          'feature-payments': ['./src/pages/PaymentFlowV2', './src/pages/ScanPage'],
          'feature-bills': ['./src/pages/BillsPage', './src/pages/RechargePage'],
          'feature-social': ['./src/pages/SplitBillPage', './src/pages/RequestMoneyPage'],
          'feature-history': ['./src/pages/TransactionHistoryV2', './src/pages/RiskAssessment'],
          'feature-guardian': ['./src/pages/GuardianMode', './src/pages/Challenges'],
          'feature-community': ['./src/pages/FraudReport', './src/pages/CommunityStats'],
          'feature-profile': ['./src/pages/Profile', './src/pages/Settings'],
          'feature-education': ['./src/pages/ScamEducation', './src/pages/AIChat'],
          'feature-admin': [
            './src/pages/AdminLogin', 
            './src/pages/AdminDashboard', 
            './src/pages/AdminUsers', 
            './src/pages/AdminFraudReports', 
            './src/pages/AdminMLModels', 
            './src/pages/AdminSystem'
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
