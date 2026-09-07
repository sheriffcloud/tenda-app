import { useCallback, useState } from 'react'
import { StyleSheet, ScrollView } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import type { BankAccountSummary } from '@tenda/shared'
import { ScreenContainer, Text, Header, Button, BottomSheet, ConfirmDialog, showToast } from '@/components/ui'
import { PayoutAccountRow, AddPayoutAccountForm } from '@/components/payout'
import { api } from '@/api/client'
import { ApiClientError } from '@tenda/shared'
import { spacing } from '@/theme/tokens'

/**
 * Settings → Payout accounts. Management home: list + delete. Adding an account
 * reuses AddPayoutAccountForm (the same country/rail/validation flow the sell
 * and create-offer dropdowns use), so the surfaces can never drift.
 */
export default function PayoutAccountsScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()

  const [accounts, setAccounts] = useState<BankAccountSummary[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BankAccountSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    api.fiat.bankAccounts().then(setAccounts).catch(() => setAccounts([]))
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function handleSaved() {
    setAddOpen(false)
    load()
  }

  async function confirmDelete() {
    const a = deleteTarget
    if (a === null) return
    setDeleting(true)
    try {
      await api.fiat.deleteBankAccount({ id: a.id })
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not remove the account')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Payout accounts" showBack onBackPress={() => router.back()} />

      <ScrollView contentContainerStyle={s.content}>
        {accounts?.map((a) => (
          <PayoutAccountRow key={a.id} account={a} onDelete={setDeleteTarget} />
        ))}
        {accounts !== null && accounts.length === 0 && (
          <Text size={13} color={theme.colors.content.tertiary} align="center" style={s.empty}>
            No payout accounts saved yet.
          </Text>
        )}

        <Button variant="outline" size="lg" fullWidth onPress={() => setAddOpen(true)}>
          Add payout account
        </Button>
      </ScrollView>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add payout account">
        <AddPayoutAccountForm isFirstAccount={(accounts?.length ?? 0) === 0} onSaved={handleSaved} />
      </BottomSheet>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Remove account"
        message={
          deleteTarget !== null ? `${deleteTarget.account_name} · ${deleteTarget.account_number_masked}` : undefined
        }
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  content: { padding: spacing.md, gap: 10 },
  empty: { paddingVertical: 16 },
})
