import { useEffect, useRef, useState } from 'react'

interface Options {
  threshold?: number | number[]
}

/**
 * Observe an element's intersection with the viewport. Fires ONCE, on first
 * entry, and stops observing: the hire loop uses it to start its clock the
 * first time it is seen, and never needs to know it left.
 */
export function useIntersect<T extends Element = HTMLDivElement>({
  threshold = 0.2,
}: Options = {}): { ref: React.RefObject<T | null>; isVisible: boolean } {
  const ref = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isVisible }
}
