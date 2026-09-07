import { useState } from 'react'
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Camera } from 'lucide-react-native'
import { ScreenContainer, Text, Spacer, Header, Avatar, Button, showToast } from '@/components/ui'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { RemoteToggle } from '@/components/form/RemoteToggle'
import { useAuthStore } from '@/stores/auth.store'
import { api, ApiClientError } from '@/api/client'
import { uploadToCloudinary } from '@/lib/upload'
import { usePostAuthReset } from '@/lib/post-auth-nav'
import { getDeviceCountry } from '@/lib/device'
import { pickAvatar, type PickedFile } from '@/components/form/FilePicker'
import { formatFullName } from '@tenda/shared'


export default function ProfileSetupScreen() {
  const { theme } = useUnistyles()
  const resetToAuthedRoot = usePostAuthReset()
  const user = useAuthStore((s) => s.user)

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName,  setLastName]  = useState(user?.last_name ?? '')
  const [country,   setCountry]   = useState<string | null>(user?.country ?? getDeviceCountry())
  const [city,      setCity]      = useState<string | null>(user?.city ?? null)
  const [isSeeker,  setIsSeeker]  = useState<boolean>(user?.is_seeker ?? false)
  const [pickedAvatar,  setPickedAvatar]  = useState<PickedFile | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleChangePhoto() {
    const file = await pickAvatar()
    if (!file) return
    setPickedAvatar(file)
    setAvatarPreview(file.uri)
  }

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !isSaving

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      let avatarUrl: string | undefined
      if (pickedAvatar) {
        avatarUrl = await uploadToCloudinary(pickedAvatar, 'avatar')
      }

      const updated = await api.users.updateMe({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        is_seeker:  isSeeker,
        ...(country !== null ? { country } : {}),
        ...(city !== null ? { city } : {}),
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      })
      useAuthStore.setState({ profileComplete: updated.profile_complete })
      // Settle the legacy user shape the rest of the app reads.
      void useAuthStore.getState().refreshUser()

      // Onboarding is name-only, no phone step. A phone (and its gas-seed perk)
      // is added later from Settings → Sign-in & security, where the OTP proves
      // ownership before we ever persist the number (an unverified phone can't
      // be stored safely, it would let one user squat another's number).
      // Reset so back from home exits, not back to setup.
      resetToAuthedRoot(true)
    } catch (e) {
      if (__DEV__) console.warn('[profile-setup] finish failed:', e)
      // Server errors carry a user-meaningful message. Other failures (e.g. the
      // direct Cloudinary avatar upload) throw a plain Error, surface its text
      // on dev builds so the real cause is visible instead of the generic copy.
      const msg =
        e instanceof ApiClientError
          ? e.message
          : __DEV__ && e instanceof Error
            ? `Could not save your profile: ${e.message}`
            : 'Could not save your profile, please try again'
      showToast('error', msg)
    } finally {
      setIsSaving(false)
    }
  }

  // Live preview of what is being typed: a lone space must not render an
  // invisible name, which is what the old filter(Boolean) join did.
  const fullName = formatFullName(firstName, lastName) || 'Your profile'

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Set up your profile" transparent />

        <ScrollView style={s.flex} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={[s.lede, { color: theme.colors.content.secondary }]}>
            A name is all you need to start. Everything else is optional, you can
            add a photo, location and a verified phone later from Settings.
          </Text>

          {/* Avatar (optional) */}
          <View style={s.avatarSection}>
            <View style={[s.avatarRing, { borderColor: theme.colors.surface.card }]}>
              <Avatar size="xl" name={fullName} src={avatarPreview} />
              <Pressable
                onPress={handleChangePhoto}
                style={[s.camOverlay, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.subtle }]}
                accessibilityLabel="Add photo"
              >
                <Camera size={14} color={theme.colors.content.primary} />
              </Pressable>
            </View>
          </View>

          <SectionLabel>About you</SectionLabel>
          <View style={[s.card, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
            <Input label="First name" placeholder="e.g. Akin" value={firstName} onChangeText={setFirstName} />
            <Spacer size={14} />
            <Input label="Last name" placeholder="e.g. Beela" value={lastName} onChangeText={setLastName} />
          </View>

          <SectionLabel>Location</SectionLabel>
          <View style={[s.card, s.cardSplit, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
            <CountryCityPicker
              country={country}
              city={city}
              onChange={(c, ct) => { setCountry(c); setCity(ct) }}
            />
          </View>

          <SectionLabel>How will you use Tenda?</SectionLabel>
          <RemoteToggle
            value={isSeeker}
            onChange={setIsSeeker}
            title="I'm looking to hire"
            hint={isSeeker ? 'You post gigs and pay workers.' : 'You find gigs and get paid for work.'}
          />

          <Spacer size={20} />
        </ScrollView>

        <View style={[s.saveBar, { backgroundColor: theme.colors.surface.background, borderTopColor: theme.colors.border.subtle }]}>
          <Button variant="primary" size="lg" fullWidth loading={isSaving} disabled={!canSubmit} onPress={handleSubmit}>
            Finish
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  lede: { fontSize: 13.5, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  avatarSection: { alignItems: 'center', marginBottom: 8 },
  avatarRing: { borderWidth: 3, borderRadius: 999, position: 'relative' },
  camOverlay: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  cardSplit: { paddingVertical: 4 },
  saveBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1 },
})
