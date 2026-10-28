import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AutoPark — Smart Parking Platform',
  description: 'Camera-based entry and exit, servo boom barriers, six bays',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-concrete text-ink min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
