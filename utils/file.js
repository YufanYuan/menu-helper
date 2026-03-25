function chooseImage(sourceType) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      camera: 'back',
      success: (res) => {
        const [file] = res.tempFiles || []
        if (!file) {
          reject(new Error('未选择图片'))
          return
        }

        resolve({
          path: file.tempFilePath,
          size: file.size || 0,
          width: file.width || 0,
          height: file.height || 0,
        })
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
  chooseImage,
  compressImage,
  readFileAsBase64,
  getMimeType,
}
