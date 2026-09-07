import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spacer } from '@/components/ui/Spacer'
import { showToast } from '@/components/ui/Toast'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { StarRating } from '@/components/form/StarRating'
import { useGigsStore } from '@/stores/gigs.store'
import { errorMessage, type ReviewInput } from '@tenda/shared'

type Score = 1 | 2 | 3 | 4 | 5

/** Leave-a-review sheet. Submits via the gigs store, then notifies the parent. */
export function ReviewSheet({
  visible,
  onClose,
  escrowId,
  onReviewSubmitted,
}: {
  visible: boolean
  onClose: () => void
  escrowId: string
  onReviewSubmitted: () => void
}) {
  const { reviewEscrow } = useGigsStore()
  const [score, setScore] = useState<Score | null>(null)
  const [comment, setComment] = useState('')

  function close() {
    setScore(null)
    setComment('')
    onClose()
  }

  async function handleReview() {
    if (!score) return
    try {
      await reviewEscrow(escrowId, { score: score as ReviewInput['score'], comment: comment.trim() || undefined })
      close()
      onReviewSubmitted()
      showToast('success', 'Review submitted!')
    } catch (e) {
      showToast('error', errorMessage(e) || 'Failed to submit review')
    }
  }

  return (
    <BottomSheet visible={visible} onClose={close} title="Leave a review">
      <View style={s.starRow}>
        <StarRating value={score} onChange={(v) => setScore(v as Score)} />
      </View>
      <Spacer size={spacing.md} />
      <Input
        label="Comment (optional)"
        placeholder="Share your experience..."
        helper="Optional, describe how the gig went"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={3}
        style={s.multiline}
      />
      <Spacer size={spacing.md} />
      <Button variant="primary" size="xl" fullWidth disabled={!score} onPress={handleReview}>
        Submit Review
      </Button>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  starRow: { alignItems: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
})
