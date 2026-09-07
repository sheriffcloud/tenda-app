import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { FileText, Film, Play } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import type { MediaItem } from './media/types'

interface Props {
  proofs: MediaItem[]
  onProofPress: (proof: MediaItem) => void
}

export function ProofsGrid({ proofs, onProofPress }: Props) {
  const { theme } = useUnistyles()

  return (
    <View style={s.grid}>
      {proofs.map((proof, i) => (
        <Pressable
          key={proof.id}
          onPress={() => onProofPress(proof)}
          style={({ pressed }) => [
            s.tile,
            {
              backgroundColor: theme.colors.surface.inset,
              borderColor: theme.colors.border.subtle,
            },
            pressed && { opacity: 0.92 },
          ]}
          accessibilityLabel={`Open proof ${i + 1}`}
          accessibilityRole="button"
        >
          {proof.type === 'image' ? (
            <Image source={{ uri: proof.url }} style={s.thumb} contentFit="cover" />
          ) : (
            <View style={s.iconFill}>
              {proof.type === 'video'
                ? <Film size={28} color={theme.colors.content.secondary} />
                : <FileText size={28} color={theme.colors.content.secondary} />}
            </View>
          )}

          {proof.type === 'video' && (
            <View style={s.playBadge}>
              <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
            </View>
          )}

          <View style={s.labelPill}>
            <Text style={s.labelText}>
              {proof.type.toUpperCase()}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  grid: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    aspectRatio: 1.1,
    minHeight: 108,
    maxHeight: 128,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  iconFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.42,
  },
})
