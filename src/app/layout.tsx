import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import '@/styles/components.css';
import '@/styles/layout.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Motionz Client Portal',
  description: 'Private multi-tenant onboarding and operations portal for Motionz clients.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Motionz',
  icons: {
    icon: [
      // Served from /icons because the auth middleware only lets /icons/* through unauthenticated.
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Motionz',
    statusBarStyle: 'black-translucent',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0E1217',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
