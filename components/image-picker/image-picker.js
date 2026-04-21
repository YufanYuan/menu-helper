const { chooseImages } = require('../../utils/file')
const { isMultiImageUploadEnabled } = require('../../config/features')

Component({
  properties: {
    imagePaths: {
      type: Array,
      value: [],
    },
    uploadLimit: {
      type: Number,
      value: 1,
    },
  },

  methods: {
    async chooseFromCamera() {
      if (this.isSingleUploadMode()) {
        await this.pickImages(['camera'], 1, 'replace')
        return
      }

      if (this.getRemainingSlots() <= 0) {
        this.showUploadLimitToast()
        return
      }

      await this.pickImages(['camera'], 1)
    },

    async chooseFromAlbum() {
      if (this.isSingleUploadMode()) {
        await this.pickImages(['album'], 1, 'replace')
        return
      }

      const remaining = this.getRemainingSlots()

      if (remaining <= 0) {
        this.showUploadLimitToast()
        return
      }

      await this.pickImages(['album'], remaining)
    },

    handleClear() {
      this.triggerEvent('cleared')
    },

    getRemainingSlots() {
      const uploadLimit = Math.max(1, Number(this.data.uploadLimit) || 1)
      const selectedCount = Array.isArray(this.data.imagePaths) ? this.data.imagePaths.length : 0
      return Math.max(uploadLimit - selectedCount, 0)
    },

    isSingleUploadMode() {
      return !isMultiImageUploadEnabled() || (Number(this.data.uploadLimit) || 1) <= 1
    },

    showUploadLimitToast() {
      wx.showToast({
        title: `最多上传 ${this.data.uploadLimit} 张`,
        icon: 'none',
      })
    },

    async pickImages(sourceType, count, mergeModeOverride) {
      try {
        const files = await chooseImages(sourceType, count)
        const mergeMode = mergeModeOverride || (this.isSingleUploadMode() ? 'replace' : 'append')
        this.triggerEvent('selected', { files, mergeMode })
      } catch (error) {
        if (error && error.errMsg && error.errMsg.includes('cancel')) {
          return
        }
        wx.showToast({
          title: '选择图片失败',
          icon: 'none',
        })
      }
    },
  },
})
