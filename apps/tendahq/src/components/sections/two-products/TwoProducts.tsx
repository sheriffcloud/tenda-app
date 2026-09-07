import { SectionShell } from '@/components/ui/SectionShell'
import { EXAMPLE_TASKS } from '@/content'
import { GIG_PANEL_ROWS, PRODUCT_PANELS } from './content'
import { ProductPanel } from './ProductPanel'
import { GigListRow } from './GigListRow'
import { TradeDeck } from './TradeDeck'
import { Bridge } from './Bridge'

/**
 * §03 Two products — side-by-side identity for Gigs (brand) and Exchange
 * (accent). The gigs panel lists dense example rows; the exchange panel runs
 * the TradeDeck — corridors of crypto → local cash swiping up. Both visuals
 * draw from the central content layer.
 */
export function TwoProducts() {
  const sampleGigs = EXAMPLE_TASKS.slice(0, GIG_PANEL_ROWS)

  return (
    <SectionShell id="products" surface="base" padY="lg">
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {PRODUCT_PANELS.map((panel) => (
          <ProductPanel key={panel.id} panel={panel}>
            {panel.id === 'gigs' ? (
              <div className="flex flex-col gap-2">
                {sampleGigs.map((task) => (
                  <GigListRow key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <TradeDeck />
            )}
          </ProductPanel>
        ))}
      </div>

      <Bridge />
    </SectionShell>
  )
}
