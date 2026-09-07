import { View } from 'react-native'

interface SpacerProps {
  size?: number
  flex?: number
}

export function Spacer({ size, flex }: SpacerProps) {
  if (flex !== undefined) {
    return <View style={{ flex }} />
  }
  return <View style={{ height: size, width: size }} />
}
