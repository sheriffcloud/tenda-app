/**
 * Browser-side avatar preparation — the web replacement for mobile's
 * FilePicker.pickAvatar(): square CENTER-CROP + downscale via canvas
 * before the Cloudinary upload, so a 12MP photo never hits the 10MB
 * server cap and avatars are uniform without server-side transforms.
 */
export const AVATAR_SIZE_PX = 512

export async function cropAvatarSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read that image'))
      img.src = url
    })

    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const sx = (image.naturalWidth - side) / 2
    const sy = (image.naturalHeight - side) / 2

    const canvas = document.createElement('canvas')
    const out = Math.min(side, AVATAR_SIZE_PX)
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('Could not process that image')
    ctx.drawImage(image, sx, sy, side, side, 0, 0, out, out)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    )
    if (blob === null) throw new Error('Could not process that image')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Cropped blob → File (the upload seam takes a File). */
export async function prepareAvatarFile(picked: File): Promise<File> {
  const blob = await cropAvatarSquare(picked)
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
}
