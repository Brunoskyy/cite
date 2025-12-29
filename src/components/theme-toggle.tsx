'use client'

import { useEffect, useState } from 'react'

import { nextTheme, parseTheme, THEME_KEY, type ThemeChoice } from '@/lib/theme'

const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: follows your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

function readChoice(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

/** Cycles system, light, dark. The boot script in <head> has already applied the stored choice. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading storage after hydration, once
    setChoice(readChoice())
  }, [])

  const current = choice ?? 'system'
  return (
    <button
      type="button"
      onClick={() => {
        const next = nextTheme(current)
        apply(next)
        setChoice(next)
      }}
      aria-label={`${LABEL[current]}. Change theme`}
      title={LABEL[current]}
      className="text-muted hover:text-ink -m-2 inline-flex h-9 w-9 items-center justify-center rounded-full p-2"
    >
      <Icon choice={current} />
    </button>
  )
}

function Icon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (choice === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (choice === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}
