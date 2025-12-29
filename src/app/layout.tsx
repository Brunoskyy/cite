import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Source_Serif_4 } from 'next/font/google'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/site-header'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'

import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const serif = Source_Serif_4({
  variable: '--font-serif-face',
  subsets: ['latin'],
  style: ['normal', 'italic'],
})
const mono = JetBrains_Mono({
  variable: '--font-mono-face',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: { default: 'Cite', template: '%s · Cite' },
  description:
    'Ask the TanStack Query docs a question and get an answer where every claim links to the lines it came from.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="bg-surface sr-only rounded px-3 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  )
}
