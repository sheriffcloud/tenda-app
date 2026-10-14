import Link from 'next/link'
import { CREATE_OPTIONS } from '@/components/create/create-options'

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 py-12">
      <h1 className="font-display text-3xl font-bold text-content-primary">What would you like to create?</h1>
      <p className="mt-2 text-sm leading-6 text-content-secondary">Choose a focused composer. Saved drafts remain available from My Gigs.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CREATE_OPTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-card border border-border-default bg-surface-card p-5 shadow-card transition hover:border-border-strong hover:shadow-elevated">
            <Icon className="text-brand-primary" size={24} aria-hidden />
            <h2 className="mt-5 font-display text-lg font-semibold text-content-primary">{title}</h2>
            <p className="mt-2 text-sm leading-5 text-content-secondary">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
