import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/layout/Navbar'
import { Footer } from './components/sections/footer/Footer'
import {
  LANDING_SECTIONS,
  sectionSurface,
} from './components/sections/landing-sections'
import { Terms } from './components/sections/Terms'
import { Privacy } from './components/sections/Privacy'

/**
 * The landing composition, exported apart from <App /> so it can be rendered
 * without a router. <App /> mounts a BrowserRouter, which needs a DOM this
 * project deliberately does not install — the suite renders to static markup
 * instead. Exporting the page is what lets `page-rhythm.test.tsx` assert
 * against the REAL section order rather than against a copy of it that could
 * drift from the page it claims to check.
 *
 * The order and the placement rationale live in `landing-sections.ts`; the
 * surface each section renders is DERIVED from its position here (#55), so
 * inserting a section is one line in that array and costs nothing downstream.
 */
export function LandingPage() {
  return (
    <>
      {LANDING_SECTIONS.map(({ key, Section }, index) => (
        <Section key={key} surface={sectionSurface(index)} />
      ))}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
