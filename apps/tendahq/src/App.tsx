import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/layout/Navbar'
import { Footer } from './components/sections/footer/Footer'
import { Hero } from './components/sections/hero/Hero'
import { TaskWall } from './components/sections/task-wall/TaskWall'
import { TwoProducts } from './components/sections/two-products/TwoProducts'
import { CurrencyMarquee } from './components/sections/two-products/CurrencyMarquee'
import { HowEscrowWorks } from './components/sections/how-escrow-works/HowEscrowWorks'
import { Onboarding } from './components/sections/onboarding/Onboarding'
import { Ecosystems } from './components/sections/ecosystems/Ecosystems'
import { FAQ } from './components/sections/faq/FAQ'
import { FinalCTA } from './components/sections/final-cta/FinalCTA'
import { Terms } from './components/sections/Terms'
import { Privacy } from './components/sections/Privacy'

function LandingPage() {
  // Spine: dark hero → light task wall → dark products (+ full-bleed currency
  // marquee) → dark escrow explainer → light onboarding rails → dark
  // ecosystems → FAQ → final CTA.
  return (
    <>
      <Hero />
      <TaskWall />
      <TwoProducts />
      <CurrencyMarquee />
      <HowEscrowWorks />
      <Onboarding />
      <Ecosystems />
      <FAQ />
      <FinalCTA />
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
