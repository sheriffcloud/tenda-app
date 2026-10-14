'use client'

/** Step 1 — taxonomy. What the gig files under, which is also how it is found. */
import { CategoryGrid } from '../../CategoryGrid'
import type { GigFormController } from '@/hooks/gig/useGigForm'

export function CategoryStep({ form }: { form: GigFormController }) {
  return (
    <div className="mt-7">
      <CategoryGrid selected={form.selectedCategory} onChange={form.setSelectedCategory} />
    </div>
  )
}
