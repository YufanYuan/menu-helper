const { chooseImage } = require('../../utils/file')

Component({
  properties: {
    imagePath: {
      type: String,
      value: '',
    },
  },

  methods: {
    async chooseFromCamera() {
      await this.pickImage(['camera'])
    },

    async chooseFromAlbum() {
      await this.pickImage(['album'])
    },

    async pickImage(sourceType) {
      try {
        const file = await chooseImage(sourceType)
        this.triggerEvent('selected', file)
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
