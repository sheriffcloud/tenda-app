import { useEffect, useRef, useState } from 'react'

interface Options {
  threshold?: number | number[]
  rootMargin?: string
  /** Stop observing after the first intersection. Default: true. */
  once?: boolean
}

/**
 * Observe an element's intersection with the viewport. By default, fires once
 * on first entry — useful for entrance animations and count-ups.
 */
export function useIntersect<T extends Element = HTMLDivElement>({
  threshold = 0.2,
  rootMargin = '0px',
  once = true,
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
          if (once) observer.disconnect()
        } else if (!once) {
          setIsVisible(false)
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, isVisible }
}
