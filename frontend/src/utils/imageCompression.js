// Client-side image resize/compress (max dimension + JPEG quality) for rural bandwidth constraints.
// Shared by DiseaseScanPage and FarmerDashboard's disease-scan tab (previously duplicated independently).
export function compressImage(file, { maxDim = 1024, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let width = img.width
      let height = img.height

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas compression failed'))
            return
          }
          // Output is always JPEG, so give it a matching extension (a ".png" name with JPEG bytes
          // confuses extension-based checks and downloads).
          const baseName = (file.name || 'leaf').replace(/\.[^./\\]+$/, '') || 'leaf'
          const compressedFile = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          const origSizeKB = Math.round(file.size / 1024)
          const compSizeKB = Math.round(blob.size / 1024)
          const savedPct = Math.max(0, Math.round(((file.size - blob.size) / file.size) * 100))

          resolve({
            file: compressedFile,
            meta: { origKB: origSizeKB, compKB: compSizeKB, savedPct, dimensions: `${width}×${height}px` },
          })
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not parse image file'))
    }
  })
}
