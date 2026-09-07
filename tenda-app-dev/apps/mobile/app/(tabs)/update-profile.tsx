import { useState } from 'react'
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useRouter } from 'expo-router'
import { Camera } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { ScreenContainer, Text, Spacer, Header, Avatar, Button, showToast } from '@/components/ui'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { uploadToCloudinary } from '@/lib/upload'
import {
  coerceCityForCountry,
  errorMessage,
  findCountryForCity,
  formatFullName,
} from '@tenda/shared'
import { pickAvatar, type PickedFile } from '@/components/form/FilePicker'

const BIO_MAX = 1200

export default function UpdateProfileScreen() {
  const { theme } = useUnistyles()
  const router = useRouter()
  const { user, updateUser } = useAuthStore()

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName,  setLastName]  = useState(user?.last_name ?? '')
  const [bio,       setBio]       = useState(user?.bio ?? '')
  const [city,      setCity]      = useState<string | null>(user?.city ?? null)
  const [country,   setCountry]   = useState<string | null>(
    user?.country ?? (user?.city ? (findCountryForCity(user.city) ?? null) : null),
  )
  const [pickedAvatar,  setPickedAvatar]  = useState<PickedFile | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null)
  const [isLoading,     setIsLoading]     = useState(false)

  async function handleChangePhoto() {
    const file = await pickAvatar()
    if (!file) return
    setPickedAvatar(file)
    setAvatarPreview(file.uri)
  }

  async function handleSave() {
    if (!user) return
    setIsLoading(true)
    try {
      let avatarUrl = user.avatar_url
      if (pickedAvatar) {
        avatarUrl = await uploadToCloudinary(pickedAvatar, 'avatar')
      }

      // Defensive coercion: drop city if it doesn't belong to the selected
      // country (handles edge cases where state was already inconsistent).
      const safeCity = coerceCityForCountry(country, city)
      const updated = await api.users.update(
        { id: user.id },
        {
          first_name: firstName.trim() || undefined,
          last_name:  lastName.trim()  || undefined,
          bio:        bio.trim()       || undefined,
          country:    country  ?? undefined,
          city:       safeCity ?? undefined,
          avatar_url: avatarUrl ?? undefined,
        },
      )
      updateUser(updated)
      showToast('success', 'Profile updated!')
      router.back()
    } catch (e) {
      showToast('error', errorMessage(e) || 'Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  // Live preview of what is being typed. The whitespace fix matters MORE here
  // than anywhere: a lone space used to render an invisible name.
  const fullName = formatFullName(firstName, lastName) || 'You'
  const bioCharColor = bio.length > BIO_MAX
    ? theme.colors.feedback.danger.base
    : theme.colors.content.tertiary

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header title="Update profile" showBack />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar + change-photo */}
          <View style={s.avatarSection}>
            <View style={[s.avatarRing, { borderColor: theme.colors.surface.card }]}>
              <Avatar size="xl" name={fullName} src={avatarPreview} />
              <Pressable
                onPress={handleChangePhoto}
                style={[
                  s.camOverlay,
                  {
                    backgroundColor: theme.colors.surface.card,
                    borderColor: theme.colors.border.subtle,
                  },
                ]}
                accessibilityLabel="Change photo"
              >
                <Camera size={14} color={theme.colors.content.primary} />
              </Pressable>
            </View>
            <Pressable
              onPress={handleChangePhoto}
              style={({ pressed }) => [
                s.changePhoto,
                {
                  borderColor: theme.colors.brand.primaryBorder,
                  backgroundColor: pressed ? theme.colors.brand.primarySurface : 'transparent',
                },
              ]}
            >
              <Text style={[s.changePhotoText, { color: theme.colors.brand.primary }]}>
                Change photo
              </Text>
            </Pressable>
          </View>

          {/* Personal info */}
          <SectionLabel>Personal info</SectionLabel>
          <View style={[s.card, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
            <Input
              label="First name"
              placeholder="e.g. Akin"
              value={firstName}
              onChangeText={setFirstName}
            />
            <Spacer size={14} />
            <Input
              label="Last name"
              placeholder="e.g. Beela"
              value={lastName}
              onChangeText={setLastName}
            />
            <Spacer size={14} />
            <Input
              label="Bio"
              placeholder="Tell people about yourself…"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              style={s.multiline}
            />
            <View style={s.helper}>
              <Text style={[s.helperText, { color: theme.colors.content.tertiary }]}>
                Markdown supported
              </Text>
              <Text style={[s.charCount, { color: bioCharColor }]}>
                {bio.length} / {BIO_MAX}
              </Text>
            </View>
          </View>

          {/* Location */}
          <SectionLabel>Location</SectionLabel>
          <View style={[s.card, s.cardSplit, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
            <CountryCityPicker
              country={country}
              city={city}
              onChange={(c, ct) => { setCountry(c); setCity(ct) }}
            />
          </View>

          <Spacer size={20} />
        </ScrollView>

        {/* Sticky save bar */}
        <View
          style={[
            s.saveBar,
            {
              backgroundColor: theme.colors.surface.background,
              borderTopColor: theme.colors.border.subtle,
            },
          ]}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            onPress={handleSave}
          >
            Save changes
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
  },
  avatarRing: {
    borderRadius: 100,
    borderWidth: 3,
    position: 'relative',
  },
  camOverlay: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  cardSplit: {
    padding: 0,
    overflow: 'hidden',
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  helper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  helperText: {
    fontSize: 11.5,
  },
  charCount: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 11.5,
    letterSpacing: 0.115,
  },
  saveBar: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
})
