import { useEffect, useState } from 'react'
import { Dimensions, Keyboard, type KeyboardEvent } from 'react-native'

/**
 * On-screen software-keyboard height in px (0 when hidden), for manually padding
 * a bottom-anchored bar above the keyboard.
 *
 * We do NOT use KeyboardAvoidingView: under SDK 54 edge-to-edge it can't tell
 * "keyboard hidden" from the persistent nav-bar inset, so it leaves a spurious
 * pad at rest. We also can't trust `endCoordinates.height` — edge-to-edge Android
 * reports it MINUS the bottom system inset, which under-lifts the bar by the
 * nav-bar height. So we derive the true height from the keyboard's TOP
 * (`screenY`) against the full screen height (the same thing a KAV measures),
 * and force 0 on the hide events so the resting position is exact.
 *
 * Listens to both `will*` (iOS, fires at animation start → moves with the
 * keyboard) and `did*` (Android, the only ones it emits) so it is correct and
 * smooth on both platforms.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      const screenHeight = Dimensions.get('screen').height
      setHeight(Math.max(0, screenHeight - e.endCoordinates.screenY))
    }
    const onHide = () => setHeight(0)
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ]
    return () => subs.forEach((sub) => sub.remove())
  }, [])

  return height
}
