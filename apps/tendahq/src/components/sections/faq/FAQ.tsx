import { SectionShell } from '@/components/ui/SectionShell'
import { FAQ_CATEGORIES } from './content'
import { FaqCategoryBlock } from './FaqCategoryBlock'
import { FaqHeader } from './FaqHeader'
import { FaqStillQuestions } from './FaqStillQuestions'

/**
 * §09 FAQ section. Five category blocks, each owning its own
 * single-open accordion (so a Q open in one category doesn't close one in
 * another). All Q&As collapsed by default per IMPLEMENTATION.md §7.
 */
export function FAQ() {
  return (
    <SectionShell id="faq" surface="base" padY="lg">
      <FaqHeader />

      <div className="mt-12 flex flex-col gap-5">
        {FAQ_CATEGORIES.map((category) => (
          <FaqCategoryBlock key={category.slug} category={category} />
        ))}
      </div>

      <FaqStillQuestions />
    </SectionShell>
  )
}
