import { View, Pressable, StyleSheet, Image, ScrollView } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Plus, X, FileText, Film } from 'lucide-react-native'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { pickDocuments, pickImages, pickVideos } from './file-picker/file-picker.operations'
import type { AcceptedFileType, PickedFile } from './file-picker/file-picker.types'

export {
  pickAvatar,
  pickDocument,
  pickDocuments,
  pickImage,
  pickImages,
} from './file-picker/file-picker.operations'
export type { PickedFile } from './file-picker/file-picker.types'

interface FilePickerProps {
  files: PickedFile[]
  onChange: (files: PickedFile[]) => void
  accept?: AcceptedFileType
  max?: number
  /** Hide the thumbnail preview strip. Useful when the parent already shows a preview (e.g. Avatar). */
  showPreview?: boolean
}

export function FilePicker({ files, onChange, accept = 'any', max = 5, showPreview = true }: FilePickerProps) {
  const { theme } = useUnistyles()
  const canAdd = files.length < max

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  async function addFiles(picker: (limit: number) => Promise<PickedFile[]>) {
    const remaining = max - files.length
    if (remaining <= 0) return
    const picked = await picker(remaining)
    if (picked.length > 0) onChange([...files, ...picked].slice(0, max))
  }

  const showImage = accept === 'image' || accept === 'any'
  const showVideo = accept === 'video' || accept === 'any'
  const showDocument = accept === 'document' || accept === 'any'

  return (
    <View style={s.container}>
      {/* Action buttons */}
      {canAdd && (
        <View style={s.actions}>
          {showImage && (
            <Pressable
              onPress={() => addFiles(pickImages)}
              style={[s.actionBtn, { backgroundColor: theme.colors.surface.backgroundAlt }]}
            >
              <Plus size={16} color={theme.colors.brand.primary} />
              <Text size={13} weight="medium" color={theme.colors.brand.primary}>Photo</Text>
            </Pressable>
          )}
          {showVideo && (
            <Pressable
              onPress={() => addFiles(pickVideos)}
              style={[s.actionBtn, { backgroundColor: theme.colors.surface.backgroundAlt }]}
            >
              <Film size={16} color={theme.colors.brand.primary} />
              <Text size={13} weight="medium" color={theme.colors.brand.primary}>Video</Text>
            </Pressable>
          )}
          {showDocument && (
            <Pressable
              onPress={() => addFiles(() => pickDocuments())}
              style={[s.actionBtn, { backgroundColor: theme.colors.surface.backgroundAlt }]}
            >
              <FileText size={16} color={theme.colors.brand.primary} />
              <Text size={13} weight="medium" color={theme.colors.brand.primary}>Document</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Preview */}
      {showPreview && files.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.preview}>
          {files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={s.fileItem}>
              {file.type === 'image' ? (
                <Image source={{ uri: file.uri }} style={s.thumbnail} />
              ) : (
                <View style={[s.filePlaceholder, { backgroundColor: theme.colors.surface.backgroundAlt }]}>
                  {file.type === 'video'
                    ? <Film size={24} color={theme.colors.content.secondary} />
                    : <FileText size={24} color={theme.colors.content.secondary} />
                  }
                  <Text size={10} color={theme.colors.content.secondary} numberOfLines={2} style={s.fileName}>
                    {file.name}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => remove(index)}
                style={[s.removeBtn, { backgroundColor: theme.colors.feedback.danger.base }]}
              >
                <X size={10} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <Text variant="caption" color={theme.colors.content.tertiary}>
        {files.length}/{max} files selected
      </Text>
    </View>
  )
}

const THUMB_SIZE = 80

const s = StyleSheet.create({
  container: { gap: spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  preview: {
    flexDirection: 'row',
  },
  fileItem: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.sm,
  },
  filePlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
  },
  fileName: {
    textAlign: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
