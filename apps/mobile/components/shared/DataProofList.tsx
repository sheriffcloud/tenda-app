import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { PROOF_TYPE_LABEL, proofPayloadLines, type EscrowProof } from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

/**
 * The DATA proofs of an escrow (geotag/text/structured), rendered as their
 * payload — the sibling of ProofsGrid, which renders the FILE proofs as
 * media. Lines come from the shared formatter so one payload reads the same
 * on every surface (web dossier, admin gallery). Renders nothing when the
 * escrow holds no data proof, which is every escrow that predates them.
 */
export function DataProofList({ proofs }: { proofs: readonly EscrowProof[] }) {
  const { theme } = useUnistyles()
  const dataProofs = proofs.filter((proof) => proof.payload !== null)
  if (dataProofs.length === 0) return null

  return (
    <View style={s.list}>
      {dataProofs.map((proof) => (
        <View
          key={proof.id}
          style={[
            s.card,
            {
              backgroundColor: theme.colors.surface.card,
              borderColor: theme.colors.border.subtle,
            },
          ]}
        >
          <Text variant="caption" weight="semibold" color={theme.colors.content.secondary}>
            {PROOF_TYPE_LABEL[proof.type]}
          </Text>
          {proof.payload !== null &&
            proofPayloadLines(proof.payload).map((line, index) => (
              <View key={index} style={s.line}>
                {line.label !== null && (
                  <Text variant="caption" color={theme.colors.content.tertiary}>
                    {line.label}
                  </Text>
                )}
                <Text variant="body" style={s.value}>
                  {line.value}
                </Text>
              </View>
            ))}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  value: { flexShrink: 1 },
})
