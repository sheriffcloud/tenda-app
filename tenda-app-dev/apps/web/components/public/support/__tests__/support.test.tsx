/**
 * The support centre's shell and its three body shapes.
 *
 * The load-bearing property throughout: every title, blurb and route comes
 * from shared `SUPPORT_TOPICS`, so the rail can never link to a page that
 * calls itself something else — which is what six pages of hand-typed titles
 * had made possible.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_INFO, SUPPORT_FAQS, SUPPORT_TOPICS } from '@tenda/shared'
import {
  GuideSteps,
  InfoCard,
  SUPPORT_COPY,
  SUPPORT_NAV,
  SupportAccordion,
  SupportFaqList,
  SupportGuideGrid,
  SupportNav,
  SupportPage,
  SupportTopicPage,
  supportTopic,
  supportTopicMetadata,
} from '@/components/public/support'

describe('SUPPORT_NAV', () => {
  it('offers the index plus every shared topic, and nothing else', () => {
    expect(SUPPORT_NAV).toHaveLength(SUPPORT_TOPICS.length + 1)
    expect(SUPPORT_NAV[0]).toMatchObject({ slug: null, href: '/support' })
    for (const topic of SUPPORT_TOPICS) {
      expect(SUPPORT_NAV.some((entry) => entry.href === `/support/${topic.slug}`)).toBe(true)
    }
  })
})

describe('SupportNav', () => {
  it('is a named landmark, so the rail is skippable', () => {
    render(<SupportNav current={null} />)
    expect(
      screen.getByRole('navigation', { name: SUPPORT_COPY.navLabel }),
    ).toBeInTheDocument()
  })

  it('marks the current page with aria-current, and only that one', () => {
    render(<SupportNav current="faq" />)
    const faq = screen.getByRole('link', { name: supportTopic('faq').title })
    expect(faq).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: SUPPORT_COPY.navIndex })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks the INDEX when there is no topic', () => {
    render(<SupportNav current={null} />)
    expect(screen.getByRole('link', { name: SUPPORT_COPY.navIndex })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('sends a stuck reader to a channel that EXISTS', () => {
    // The comp says "open a support thread from Settings". There is no such
    // thread — Settings' only support affordance links back to /support, so
    // following it walks the reader in a circle. These two are real.
    render(<SupportNav current={null} />)
    expect(screen.getByRole('link', { name: APP_INFO.support.email })).toHaveAttribute(
      'href',
      `mailto:${APP_INFO.support.email}`,
    )
    expect(screen.getByRole('link', { name: 'WhatsApp group' })).toHaveAttribute(
      'href',
      APP_INFO.support.whatsapp,
    )
  })

  it('never points a stuck reader back at /support or at Settings', () => {
    render(<SupportNav current="faq" />)
    const contact = screen.getByText(SUPPORT_COPY.stuckNote).parentElement
    const hrefs = Array.from(contact?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/support')
  })
})

describe('SupportPage', () => {
  it('publishes ONE h1 and puts the article before the rail in the DOM', () => {
    const { container } = render(
      <SupportPage heading="A heading" intro="An intro." slug={null}>
        <p>Body</p>
      </SupportPage>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // A screen reader and a no-CSS reader both get the article first; the grid
    // places the rail on the right visually.
    const html = container.innerHTML
    expect(html.indexOf('Body')).toBeLessThan(html.indexOf(SUPPORT_COPY.navLabel))
  })
})

describe('SupportTopicPage', () => {
  it('takes its heading and intro from the SHARED record, not the page', () => {
    const topic = supportTopic('wallet')
    render(
      <SupportTopicPage slug="wallet">
        <p>Body</p>
      </SupportTopicPage>,
    )
    expect(screen.getByRole('heading', { level: 1, name: topic.title })).toBeInTheDocument()
    expect(screen.getByText(topic.description)).toBeInTheDocument()
  })

  it('refuses a slug the shared vocabulary does not know', () => {
    // Silently rendering a blank heading is how a broken route ships.
    expect(() => supportTopic('nonsense')).toThrow(/SUPPORT_TOPICS/)
  })
})

describe('supportTopicMetadata', () => {
  it('derives title, description and canonical from the one record', () => {
    const topic = supportTopic('escrow')
    expect(supportTopicMetadata('escrow')).toEqual({
      title: topic.title,
      description: topic.description,
      alternates: { canonical: '/support/escrow' },
    })
  })

  it('does not re-append the product name the title template already adds', () => {
    // Six pages carried "· Tenda" by hand, which the root template appends too.
    for (const topic of SUPPORT_TOPICS) {
      expect(supportTopicMetadata(topic.slug).title).not.toMatch(/·/)
    }
  })
})

describe('SUPPORT_COPY', () => {
  it('counts the guides rather than stating a number that can rot', () => {
    // The comp writes "Six short guides". Adding a seventh topic to shared
    // must not leave this page quietly lying about how many there are.
    expect(SUPPORT_COPY.indexIntro).toContain(`${SUPPORT_TOPICS.length} short guides`)
    // …and the number it states is the number of cards actually rendered.
    render(<SupportGuideGrid />)
    expect(screen.getAllByRole('listitem')).toHaveLength(SUPPORT_TOPICS.length)
  })

  it('takes the index heading from the comp, which is its only source', () => {
    expect(SUPPORT_COPY.indexHeading).toBe('Answers about escrow, gigs and payouts')
  })
})

describe('SupportGuideGrid', () => {
  it('renders one card per shared topic, linked to its own route', () => {
    render(<SupportGuideGrid />)
    const cards = screen.getAllByRole('link')
    expect(cards).toHaveLength(SUPPORT_TOPICS.length)
    for (const topic of SUPPORT_TOPICS) {
      expect(screen.getByRole('link', { name: new RegExp(topic.title) })).toHaveAttribute(
        'href',
        `/support/${topic.slug}`,
      )
    }
  })

  it('shows the shared blurb, not a second wording typed into this app', () => {
    render(<SupportGuideGrid />)
    for (const topic of SUPPORT_TOPICS) {
      expect(screen.getByText(topic.description)).toBeInTheDocument()
    }
  })

  it('is a list, because it is one', () => {
    render(<SupportGuideGrid />)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(
      SUPPORT_TOPICS.length,
    )
  })
})

describe('SupportFaqList', () => {
  it('puts every ANSWER in the HTML, not behind a bundle', () => {
    // Native <details>: the text is present and findable whether or not the
    // accordion is open, which is what a crawler and a bundle-less reader get.
    render(<SupportFaqList />)
    for (const faq of SUPPORT_FAQS) {
      expect(screen.getByText(faq.question)).toBeInTheDocument()
      expect(screen.getByText(faq.answer)).toBeInTheDocument()
    }
  })

  it('uses no JavaScript to open — the browser owns the state', () => {
    const { container } = render(<SupportFaqList />)
    expect(container.querySelectorAll('details')).toHaveLength(SUPPORT_FAQS.length)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('SupportAccordion', () => {
  it('opens without JavaScript — the browser owns the state', () => {
    const { container } = render(
      <SupportAccordion title="How escrow works">
        <p>Body</p>
      </SupportAccordion>,
    )
    expect(container.querySelector('details')).not.toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('starts closed unless the page asks otherwise', () => {
    const { container, unmount } = render(
      <SupportAccordion title="t">
        <p>b</p>
      </SupportAccordion>,
    )
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    unmount()

    const second = render(
      <SupportAccordion title="t" defaultOpen>
        <p>b</p>
      </SupportAccordion>,
    )
    expect(second.container.querySelector('details')).toHaveAttribute('open')
  })
})

describe('GuideSteps', () => {
  const steps = [
    { title: 'Fund the escrow', description: 'Sign once; the chain holds it.' },
    { title: 'Wait for proof', description: 'You get a notification.', warning: 'Do not pay off-platform.' },
    { title: 'Approve', description: 'Or let the window pass.', tip: 'The window is 48 hours.' },
  ]

  it('numbers the steps in order, as an ordered list', () => {
    const { container } = render(<GuideSteps steps={steps} />)
    expect(container.querySelector('ol')).not.toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('gives a WARNING the feedback tone — it can cost the reader money', () => {
    render(<GuideSteps steps={steps} />)
    const warning = screen.getByText('Do not pay off-platform.')
    expect(warning.className).toContain('feedback-warning')
  })

  it('shows a tip as a tip, and omits both when a step has neither', () => {
    render(<GuideSteps steps={steps} />)
    expect(screen.getByText(/The window is 48 hours\./)).toBeInTheDocument()
    // Step one has no warning and no tip, so it renders exactly two lines.
    const first = screen.getAllByRole('listitem')[0]
    expect(first.querySelectorAll('p')).toHaveLength(2)
  })
})

describe('InfoCard', () => {
  it('publishes its label as a heading and renders the body', () => {
    render(<InfoCard label="What escrow means" body="The money is locked before you start." />)
    expect(screen.getByRole('heading', { level: 2, name: 'What escrow means' })).toBeInTheDocument()
    expect(screen.getByText('The money is locked before you start.')).toBeInTheDocument()
  })

  it('takes children instead of a body, and omits the body line entirely', () => {
    const { container } = render(
      <InfoCard label="Steps">
        <p>Child</p>
      </InfoCard>,
    )
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})
