'use client'

/**
 * Edit profile — web port of mobile's update-profile: names, bio,
 * country/city (defensively coerced so an inconsistent pair can never be
 * submitted), and the avatar (browser square-crop + Cloudinary
 * server-signed upload replacing FilePicker.pickAvatar).
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { coerceCityForCountry, formatFullName, type CountryCode } from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { uploadToCloudinary } from '@/lib/uploads/upload'
import { prepareAvatarFile } from '@/lib/uploads/avatar'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { showToast } from '@/components/ui/Toast'
import { WorkspacePage } from '@/components/app/workspace'

export default function EditProfilePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [country, setCountry] = useState<CountryCode | null>((user?.country ?? null) as CountryCode | null)
  const [city, setCity] = useState<string | null>(user?.city ?? null)
  const [pickedAvatar, setPickedAvatar] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (user === null) return null

  async function handlePick(file: File) {
    try {
      const prepared = await prepareAvatarFile(file)
      setPickedAvatar(prepared)
      setAvatarPreview(URL.createObjectURL(prepared))
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not read that image')
    }
  }

  async function handleSave() {
    if (user === null) return
    setSaving(true)
    try {
      let avatarUrl = user.avatar_url
      if (pickedAvatar !== null) {
        avatarUrl = await uploadToCloudinary(pickedAvatar, 'avatar')
      }
      // Defensive coercion: drop city if it doesn't belong to the selected
      // country (handles edge cases where state was already inconsistent).
      const safeCity = coerceCityForCountry(country, city)
      await api.users.updateMe({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        bio: bio.trim() || undefined,
        country: country ?? undefined,
        city: safeCity ?? undefined,
        avatar_url: avatarUrl ?? undefined,
      })
      // updateMe answers with the trimmed MeUser shape; the store holds the
      // full row, so re-read it rather than force the shapes together.
      await refreshUser()
      showToast('success', 'Profile updated!')
      router.push('/profile')
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const previewName = formatFullName(firstName.trim() || null, lastName.trim() || null) || 'Anonymous'

  return (
    <WorkspacePage width="narrow" className="flex flex-col gap-5">
      <h1 className="pt-1 font-display text-2xl font-bold text-content-primary">Edit profile</h1>

      <div className="flex items-center gap-4">
        {avatarPreview !== null ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL / CDN preview
          <img src={avatarPreview} alt="Avatar preview" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <Avatar name={previewName} size="md" className="scale-125" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose avatar image"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handlePick(file)
            e.target.value = ''
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          Change photo
        </Button>
      </div>

      <TextField
        label="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
      />
      <TextField
        label="Last name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Last name"
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-content-primary">Bio</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="A line or two about you"
          className="rounded-control border border-border-default bg-surface-card p-3 text-sm text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand-primary"
        />
      </label>

      <CountryCityPicker
        country={country}
        city={city}
        onChange={(nextCountry, nextCity) => {
          setCountry(nextCountry as CountryCode)
          setCity(nextCity)
        }}
      />

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </WorkspacePage>
  )
}
