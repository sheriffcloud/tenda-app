import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Landmark, Smartphone, ChevronDown, Plus } from 'lucide-react-native'
import type { BankAccountSummary } from '@tenda/shared'
import { Text, BottomSheet } from '@/components/ui'
import { PayoutAccountList } from './PayoutAccountList'
import { AddPayoutAccountForm } from './AddPayoutAccountForm'

interface Props {
  /** null while loading; [] once loaded-but-empty. */
  accounts: BankAccountSummary[] | null
  selectedId: string | null
  selected: BankAccountSummary | null
  onSelect: (id: string) => void
  /** Refetch the account list after an inline add. */
  reload: () => void
}

type Mode = 'list' | 'add'

/**
 * Compact payout-account dropdown for the sell / create-offer forms: a trigger
 * showing the current selection opens a sheet to pick another account or add a
 * new one inline. A freshly-added account is auto-selected and the list
 * reloaded, so it's immediately usable without leaving the form.
 */
export function PayoutAccountSelect({ accounts, selectedId, selected, onSelect, reload }: Props) {
  const { theme } = useUnistyles()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('list')

  const isEmpty = accounts !== null && accounts.length === 0
  const hasAccounts = accounts !== null && accounts.length > 0

  function openSheet() {
    // No accounts yet → go straight to the add form (nothing to list).
    setMode(isEmpty ? 'add' : 'list')
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setMode('list') // reopen always starts on the list, never a half-filled form
  }

  function handleSelect(id: string) {
    onSelect(id)
    close()
  }

  function handleSaved(account: BankAccountSummary) {
    onSelect(account.id) // auto-select the account the user just added
    reload()
    close()
  }

  function manage() {
    close()
    router.push('/settings/bank-accounts' as Parameters<typeof router.push>[0])
  }

  const Icon = selected?.kind === 'mobile_money' ? Smartphone : Landmark

  return (
    <>
      <Pressable
        onPress={openSheet}
        style={[s.trigger, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}
        accessibilityRole="button"
        accessibilityLabel={isEmpty ? 'Add a payout account' : 'Select payout account'}
      >
        {selected !== null ? (
          <>
            <Icon size={16} color={theme.colors.content.secondary} />
            <View style={s.triggerBody}>
              <Text size={13.5} weight="semibold">{selected.account_name}</Text>
              <Text size={12} color={theme.colors.content.tertiary}>
                {selected.bank_code} · {selected.account_number_masked}
              </Text>
            </View>
          </>
        ) : (
          <Text size={13.5} color={theme.colors.content.tertiary} style={s.triggerBody}>
            {isEmpty ? 'Add a payout account' : 'Select payout account'}
          </Text>
        )}
        <ChevronDown size={18} color={theme.colors.content.tertiary} />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={close}
        title={mode === 'add' ? 'Add payout account' : 'Payout account'}
      >
        {mode === 'list' ? (
          <View style={s.sheetBody}>
            <PayoutAccountList accounts={accounts ?? []} selectedId={selectedId} onSelect={handleSelect} />
            <Pressable
              onPress={() => setMode('add')}
              style={[s.addRow, { borderColor: theme.colors.border.default }]}
              accessibilityRole="button"
              accessibilityLabel="Add new account"
            >
              <Plus size={16} color={theme.colors.brand.primary} />
              <Text size={13.5} weight="semibold" color={theme.colors.brand.primary}>
                Add new account
              </Text>
            </Pressable>
            {/* Lifecycle (remove / view all) lives on the settings screen — the
                dropdown stays a selection control, not a management surface. */}
            {hasAccounts && (
              <Pressable
                onPress={manage}
                style={s.manageRow}
                accessibilityRole="button"
                accessibilityLabel="Manage payout accounts"
              >
                <Text size={12.5} color={theme.colors.content.tertiary}>Manage accounts</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <AddPayoutAccountForm isFirstAccount={isEmpty} onSaved={handleSaved} />
        )}
      </BottomSheet>
    </>
  )
}

const s = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  triggerBody: { flex: 1, gap: 2 },
  sheetBody: { gap: 8 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  manageRow: { alignItems: 'center', paddingVertical: 8 },
})
