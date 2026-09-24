import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import '@/styles/components.css';
import '@/styles/layout.css';

export const metadata: Metadata = {
  title: 'Motionz Client Portal',
  description: 'Private multi-tenant onboarding and operations portal for Motionz clients.',
  manifest: '/manifest.webmanifest',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1015',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body>{children}</body>
    </html>
  );
}
