'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'tenda_workspace_rail_expanded'
const LARGE_SCREEN = '(min-width: 1101px)'
const CHANGE_EVENT = 'tenda:rail-preference'

function expandedSnapshot(): boolean {
  const large = window.matchMedia(LARGE_SCREEN).matches
  const value = window.localStorage.getItem(`${STORAGE_KEY}:${large ? 'large' : 'small'}`)
  return value === null ? large : value === 'true'
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(LARGE_SCREEN)
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  query.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
    query.removeEventListener('change', onChange)
  }
}

export function useRailExpansion() {
  const expanded = useSyncExternalStore(subscribe, expandedSnapshot, () => false)
  function toggle() {
    const large = window.matchMedia(LARGE_SCREEN).matches
    window.localStorage.setItem(`${STORAGE_KEY}:${large ? 'large' : 'small'}`, String(!expanded))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  return { expanded, toggle }
}
