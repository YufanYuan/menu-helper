const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { compressImage, getMimeType, readFileAsBase64 } = require('../../utils/file')
const { recognizeMenu } = require('../../services/menu-recognition')
const { getMenuImageUploadLimit } = require('../../config/features')
const { mergeImagePaths } = require('../../utils/image-selection')
const { buildHomeShareContent, showHomeShareMenu } = require('../../utils/share')

const languageOptions = ['中文', 'English', '日本語', '한국어']

Page({
  data: {
    imagePaths: [],
    uploadLimit: 1,
    selectedLanguageIndex: 0,
    languageOptions,
    isConfigLoading: true,
    configLoadError: '',
    isAnalyzing: false,
    loadingTitle: '正在加载配置',
    loadingSubtitle: '首次进入会先同步服务配置，请稍候',
  },

  async onLoad() {
    const session = sessionStore.getState()
    if (session.recognitionStatus !== 'ready') {
      sessionStore.clearSession()
    }

    await this.ensureConfigReady()
    this.syncSettings()
  },

  onShow() {
    this.syncSettings()
    showHomeShareMenu()
  },

  onShareAppMessage() {
    return buildHomeShareContent()
  },

  onShareTimeline() {
    return buildHomeShareContent()
  },

  handleImageSelected(event) {
    const files = event.detail.files || []
    const incomingPaths = files.map((file) => file.path).filter(Boolean)

    this.setData({
      imagePaths: mergeImagePaths(
        this.data.imagePaths,
        incomingPaths,
        this.data.uploadLimit,
        event.detail.mergeMode
      ),
    })
  },

  handleImageCleared() {
    this.setData({
      imagePaths: [],
    })
  },

  handleLanguageChange(event) {
    const selectedLanguageIndex = Number(event.detail.value) || 0
    settingsStore.setUserLanguage(languageOptions[selectedLanguageIndex])
    this.setData({ selectedLanguageIndex })
  },

  async handleRecognize() {
    if (this.data.isConfigLoading) {
      wx.showToast({
        title: '配置加载中，请稍候',
        icon: 'none',
      })
      return
    }

    if (this.data.configLoadError) {
      wx.showToast({
        title: '请先完成配置加载',
        icon: 'none',
      })
      return
    }

    if (!this.data.imagePaths.length || this.data.isAnalyzing) {
      if (!this.data.imagePaths.length) {
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
      const recognitionImages = await this.prepareRecognitionImages(this.data.imagePaths)

      settingsStore.setUserLanguage(userLanguage)
      sessionStore.setDraftImages(recognitionImages.map((image) => ({
        imagePath: image.path,
        mimeType: image.mimeType,
      })))
      sessionStore.setRecognitionStatus('loading')

      const menuResult = await recognizeMenu({
        images: recognitionImages.map((image) => ({
          imageBase64: image.imageBase64,
          mimeType: image.mimeType,
        })),
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

  syncSettings() {
    const settings = settingsStore.getState()
    const selectedLanguageIndex = Math.max(languageOptions.indexOf(settings.userLanguage), 0)

    this.setData({
      selectedLanguageIndex,
      uploadLimit: getMenuImageUploadLimit(),
    })
  },

  async ensureConfigReady(forceRefresh) {
    this.setData({
      isConfigLoading: true,
      configLoadError: '',
      loadingTitle: '正在加载配置',
      loadingSubtitle: '首次进入会先同步服务配置，请稍候',
    })

    try {
      await getApp().ensureEnvReady(forceRefresh)
      this.setData({
        isConfigLoading: false,
        configLoadError: '',
      })
    } catch (error) {
      this.setData({
        isConfigLoading: false,
        configLoadError: error.message || '配置加载失败',
      })
    }
  },

  async handleRetryConfig() {
    await this.ensureConfigReady(true)
    this.syncSettings()
  },

  async prepareRecognitionImages(imagePaths) {
    const images = []

    for (const imagePath of imagePaths) {
      const compressedPath = await compressImage(imagePath)
      const imageBase64 = await readFileAsBase64(compressedPath)

      images.push({
        path: compressedPath,
        mimeType: getMimeType(compressedPath),
        imageBase64,
      })
    }

    return images
  },
})
