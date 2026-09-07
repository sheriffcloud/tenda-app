export interface PickedFile {
  uri: string
  type: 'image' | 'video' | 'document'
  name: string
  mimeType: string
  size?: number
}

export type AcceptedFileType = 'image' | 'video' | 'document' | 'any'
