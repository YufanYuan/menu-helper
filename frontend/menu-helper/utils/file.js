function chooseImages(sourceType, count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: Math.max(1, Math.min(Number(count) || 1, 9)),
      mediaType: ['image'],
      sourceType,
      camera: 'back',
      success: (res) => {
        const files = (res.tempFiles || [])
          .filter((file) => file && file.tempFilePath)
          .map((file) => ({
            path: file.tempFilePath,
            size: file.size || 0,
            width: file.width || 0,
            height: file.height || 0,
          }))

        if (!files.length) {
          reject(new Error('未选择图片'))
          return
        }

        resolve(files)
      },
      fail: reject,
    })
  })
}

function compressImage(path) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: path,
      quality: 70,
      success: (res) => resolve(res.tempFilePath || path),
      fail: () => resolve(path),
    })
  })
}

function readFileAsBase64(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => resolve(res.data),
      fail: reject,
    })
  })
}

function getMimeType(path) {
  const lowerPath = (path || '').toLowerCase()
  if (lowerPath.endsWith('.png')) {
    return 'image/png'
  }
  if (lowerPath.endsWith('.webp')) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

module.exports = {
  chooseImages,
  compressImage,
  readFileAsBase64,
  getMimeType,
}
