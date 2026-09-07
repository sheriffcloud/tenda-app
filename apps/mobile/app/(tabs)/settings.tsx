import { useState } from 'react'
import { StyleSheet, Switch } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useRouter } from 'expo-router'
import { HelpCircle, Wallet, ShieldCheck, ArrowLeftRight, Coins, Landmark } from 'lucide-react-native'
import { ScreenContainer, Text, Spacer, Header, showToast, AppVersion } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'
import { AppearanceSegment } from '@/components/settings/AppearanceSegment'
import { SubscriptionsSection } from '@/components/settings/SubscriptionsSection'
import { CurrencySheet } from '@/components/settings/CurrencySheet'
import { useAuthStore } from '@/stores/auth.store'
import { useSettingsStore } from '@/stores/settings.store'
import { api } from '@/api/client'
import { CURRENCY_META } from '@tenda/shared'

export default function SettingsScreen() {
  const { theme } = useUnistyles()
  const router = useRouter()
  const { theme: currentTheme, setTheme, currency, setCurrency } = useSettingsStore()
  const user = useAuthStore((st) => st.user)
  const updateUser = useAuthStore((st) => st.updateUser)
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false)
  const [advancedSaving, setAdvancedSaving] = useState(false)

  const currencyMeta = CURRENCY_META[currency]

  return (
    <ScreenContainer scroll padding={false} edges={['left', 'right']}>
      <Header title="Settings" showBack />

      <SectionLabel tight>Appearance</SectionLabel>
      <AppearanceSegment value={currentTheme} onChange={setTheme} />

      <SectionLabel>Preferences</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Text style={s.flag}>{currencyMeta.flag}</Text>}
          label="Currency"
          value={`${currency} · ${currencyMeta.symbol}`}
          onPress={() => setCurrencySheetOpen(true)}
          showChevron
        />
        {/* CO4: unlocks the P2P exchange (order book + offer creation). */}
        <SettingsRow
          icon={<ArrowLeftRight size={16} color={theme.colors.content.secondary} />}
          label="P2P Exchange"
          trailing={
            <Switch
              value={user?.advanced_mode_enabled ?? false}
              disabled={advancedSaving || user === null}
              onValueChange={(next) => {
                if (user === null) return
                setAdvancedSaving(true)
                api.users
                  .updateMe({ advanced_mode_enabled: next })
                  .then(() => updateUser({ ...user, advanced_mode_enabled: next }))
                  .catch(() => showToast('error', 'Could not update the setting, try again'))
                  .finally(() => setAdvancedSaving(false))
              }}
            />
          }
        />
      </SettingsGroup>

      <SubscriptionsSection />

      <SectionLabel>Account</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<ShieldCheck size={16} color={theme.colors.content.primary} />}
          label="Sign-in & security"
          onPress={() => router.push('/settings/security' as Parameters<typeof router.push>[0])}
          showChevron
        />
        <SettingsRow
          icon={<Wallet size={16} color={theme.colors.content.primary} />}
          label="Linked wallets"
          onPress={() => router.push('/settings/linked-wallets' as Parameters<typeof router.push>[0])}
          showChevron
        />
        <SettingsRow
          icon={<Landmark size={16} color={theme.colors.content.primary} />}
          label="Payout accounts"
          onPress={() => router.push('/settings/bank-accounts' as Parameters<typeof router.push>[0])}
          showChevron
        />
        <SettingsRow
          icon={<Coins size={16} color={theme.colors.content.primary} />}
          label="Token approvals"
          onPress={() => router.push('/settings/token-approvals' as Parameters<typeof router.push>[0])}
          showChevron
        />
      </SettingsGroup>

      <SectionLabel>Help</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<HelpCircle size={16} color={theme.colors.content.primary} />}
          label="Help & Guide"
          onPress={() => router.push('/(support)' as Parameters<typeof router.push>[0])}
          showChevron
        />
      </SettingsGroup>

      <AppVersion marginTop={34} />
      <Spacer size={20} />

      <CurrencySheet
        visible={currencySheetOpen}
        onClose={() => setCurrencySheetOpen(false)}
        currency={currency}
        onSelect={(c) => {
          setCurrency(c)
          setCurrencySheetOpen(false)
        }}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flag: { fontSize: 18, includeFontPadding: false },
})
