/**
 * Future footer columns — kept as **commented reference data** so the shape
 * is preserved for when these pages exist. Uncomment + import in
 * `./sitemap.ts` as each section ships.
 *
 * Pre-launch we don't show:
 *   - Workers / Posters audience landing pages — landing already has §08
 *   - Status / API / Whitepaper / Press / Careers — pages don't exist
 *
 * To re-enable: uncomment the relevant block, import in `./sitemap.ts`,
 * append to `FOOTER_COLUMNS`.
 */

/*
import type { SitemapColumn } from './sitemap'

export const WORKERS_COLUMN: SitemapColumn = {
  title: 'Workers',
  links: [
    { label: 'Find work',       href: '#' },
    { label: 'Cash-out guide',  href: '#' },
    { label: 'Verification',    href: '#' },
    { label: 'Worker stories',  href: '#' },
  ],
}

export const POSTERS_COLUMN: SitemapColumn = {
  title: 'Posters',
  links: [
    { label: 'Post a gig',         href: '#' },
    { label: 'Business accounts', href: '#' },
    { label: 'Pricing & fees',    href: '#' },
    { label: 'Bulk hire',          href: '#', badge: 'New'  },
    { label: 'API access',         href: '#', badge: 'Soon' },
  ],
}

export const RESOURCES_COLUMN: SitemapColumn = {
  title: 'Resources',
  links: [
    { label: 'Help center',  href: '#' },
    { label: 'Docs',         href: '#', external: true, badge: '↗'  },
    { label: 'Status page',  href: '#', external: true, badge: '↗'  },
    { label: 'Whitepaper',   href: '#', external: true, badge: 'PDF'},
    { label: 'Press kit',    href: '#' },
    { label: 'Careers',      href: '#', badge: '3' },
    { label: 'Brand assets', href: '#' },
  ],
}

export const COMPANY_COLUMN: SitemapColumn = {
  title: 'Company',
  links: [
    { label: 'About',      href: '#' },
    { label: 'Manifesto',  href: '#' },
    { label: 'Compliance', href: '#' },
    { label: 'Security',   href: '#' },
  ],
}

// Live status row — uncomment once /v1/public/stats/24h ships (M75)
//
// export const FOOTER_STATUS = {
//   uptime:        { k: 'Uptime',        v: 'fromLive:uptime'       },
//   avgSettle:     { k: 'Avg settle',    v: 'fromLive:avgSettleSec' },
//   networks:      { k: 'Network',       v: 'fromAppInfo:network'   },
//   activeRegions: { k: 'Live corridors', v: 'fromLive:liveCorridors' },
// }
//
// Region/FX strip — uncomment once we have a region-pref store
//
// export const FOOTER_REGION = {
//   default: 'Global',
//   options: ['Global', 'Africa', 'Asia', 'EU', 'Americas'],
//   fxStrip: 'fromLive:exchangeRates',
// }
*/

export {}
