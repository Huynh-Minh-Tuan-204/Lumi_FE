import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { SignalRProvider } from '@/hooks/use-signalr'
import { CallProvider } from '@/hooks/use-call'
import { IdleTimeout } from '@/features/auth/idle-timeout'
import { IncomingCallOverlay } from '@/features/call/incoming-call-overlay'
import { GlobalCallOverlay } from '@/features/call/global-call-overlay'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Lumi Chat Enterprise',
  description: 'Internal communication system for enterprise',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

import { SecurityGuard } from '@/features/auth/security-guard'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <SecurityGuard>
              <SignalRProvider>
                <CallProvider>
                  <IdleTimeout />
                  <IncomingCallOverlay />
                <GlobalCallOverlay />
                  {children}
                  <Toaster />
                </CallProvider>
              </SignalRProvider>
            </SecurityGuard>
          </AuthProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}

