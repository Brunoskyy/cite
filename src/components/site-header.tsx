'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/', label: 'Ask' },
  { href: '/inspect', label: 'Retrieval' },
  { href: '/evals', label: 'Evals' },
]

export function SiteHeader() {
  const path = usePathname()
  return (
    <header className="border-line bg-bg/85 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} className="rounded-md" />
          Cite
        </Link>
        <nav aria-label="Main" className="ml-2">
          <ul className="flex gap-1 text-sm">
            {NAV.map((item) => {
              const active = item.href === '/' ? path === '/' : path.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-md px-2.5 py-1.5 ${active ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://github.com/TanStack/query/tree/main/docs/framework/react"
            className="text-muted hover:text-ink hidden text-xs sm:inline"
          >
            Corpus: TanStack Query docs
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
