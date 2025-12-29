import { Ask } from '@/components/ask'
import { FIXTURES } from '@/lib/fixtures'

export const dynamic = 'force-dynamic'

export default function Home() {
  const live = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  return (
    <div className="pt-10 sm:pt-14">
      <div className="mb-8 max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
          Ask the TanStack Query docs.
        </h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed text-balance">
          Every claim in the answer links to the lines it came from. When the docs don’t say, Cite
          says so.
        </p>
      </div>
      <Ask suggestions={FIXTURES.map((f) => f.question)} live={live} />
    </div>
  )
}
