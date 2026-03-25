const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { compressImage, readFileAsBase64, getMimeType } = require('../../utils/file')
const { recognizeMenu } = require('../../services/menu-recognition')

const languageOptions = ['中文', 'English', '日本語', '한국어']

Page({
  data: {
    imagePath: '',
    selectedLanguageIndex: 0,
    languageOptions,
    isAnalyzing: false,
    loadingTitle: '正在识别菜单',
    loadingSubtitle: '通常需要约 1 分钟，请稍候',
  },

  onShow() {
    const settings = settingsStore.getState()
    const selectedLanguageIndex = Math.max(languageOptions.indexOf(settings.userLanguage), 0)

    this.setData({
      selectedLanguageIndex,
      imagePath: '',
    })
  },

  handleImageSelected(event) {
    this.setData({
      imagePath: event.detail.path,
    })
  },

  handleLanguageChange(event) {
    const selectedLanguageIndex = Number(event.detail.value) || 0
    settingsStore.setUserLanguage(languageOptions[selectedLanguageIndex])
    this.setData({ selectedLanguageIndex })
  },

  async handleRecognize() {
    if (!this.data.imagePath || this.data.isAnalyzing) {
      if (!this.data.imagePath) {
        wx.showToast({
          title: '请先选择菜单图片',
          icon: 'none',
        })
      }
      return
    }

    const userLanguage = languageOptions[this.data.selectedLanguageIndex]

    this.setData({
      isAnalyzing: true,
      loadingTitle: '正在识别菜单',
      loadingSubtitle: '通常需要约 1 分钟，请稍候',
    })

    try {
      const compressedPath = await compressImage(this.data.imagePath)
      const imageBase64 = await readFileAsBase64(compressedPath)
      const mimeType = getMimeType(compressedPath)

      settingsStore.setUserLanguage(userLanguage)
      sessionStore.setDraftImage({
        imagePath: compressedPath,
        mimeType,
      })
      sessionStore.setRecognitionStatus('loading')

      const menuResult = await recognizeMenu({
        imageBase64,
        mimeType,
        userLanguage,
      })

      sessionStore.setMenuResult(menuResult)

      wx.navigateTo({
        url: '/pages/menu/index',
      })
    } catch (error) {
      sessionStore.setRecognitionStatus('error')
      wx.showToast({
        title: error.message || '识别失败',
        icon: 'none',
      })
    } finally {
      this.setData({
        isAnalyzing: false,
      })
    }
  },
})
