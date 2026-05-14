const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { compressImage, getMimeType, readFileAsBase64 } = require('../../utils/file')
const { recognizeMenu } = require('../../services/menu-recognition')
const { getPreferredProvider } = require('../../services/llm-client')
const { getMenuImageUploadLimit } = require('../../config/features')
const { mergeImagePaths } = require('../../utils/image-selection')
const { buildHomeShareContent, showHomeShareMenu } = require('../../utils/share')
const { trackEvent, createClientRequestId } = require('../../utils/analytics')

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
    trackEvent('home_page_view', {
      image_count: this.data.imagePaths.length,
      upload_limit: this.data.uploadLimit,
      config_ready: !this.data.isConfigLoading && !this.data.configLoadError,
      config_load_error: this.data.configLoadError,
    }, 'home')
  },

  onShareAppMessage() {
    trackEvent('share_home_app_message', {
      share_channel: 'app_message',
    }, 'home')
    return buildHomeShareContent()
  },

  onShareTimeline() {
    trackEvent('share_home_timeline', {
      share_channel: 'timeline',
    }, 'home')
    return buildHomeShareContent()
  },

  handleImageSelected(event) {
    const files = event.detail.files || []
    const incomingPaths = files.map((file) => file.path).filter(Boolean)
    const selectedCount = incomingPaths.length

    this.setData({
      imagePaths: mergeImagePaths(
        this.data.imagePaths,
        incomingPaths,
        this.data.uploadLimit,
        event.detail.mergeMode
      ),
    }, () => {
      trackEvent('home_image_select', {
        source_type: inferImageSourceType(event.detail.sourceType, selectedCount),
        selected_count: selectedCount,
        total_image_count: this.data.imagePaths.length,
        merge_mode: event.detail.mergeMode || '',
        upload_limit: this.data.uploadLimit,
      }, 'home')
    })
  },

  handleImageCleared() {
    this.setData({
      imagePaths: [],
    }, () => {
      trackEvent('home_image_clear', {
        total_image_count: 0,
      }, 'home')
    })
  },

  handleLanguageChange(event) {
    const previousLanguage = languageOptions[this.data.selectedLanguageIndex]
    const selectedLanguageIndex = Number(event.detail.value) || 0
    const selectedLanguage = languageOptions[selectedLanguageIndex]
    settingsStore.setUserLanguage(selectedLanguage)
    this.setData({ selectedLanguageIndex })

    if (selectedLanguage !== previousLanguage) {
      trackEvent('home_language_select', {
        previous_language: previousLanguage,
        selected_language: selectedLanguage,
      }, 'home')
    }
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
    const clientRequestId = createClientRequestId('recognition')
    const session = sessionStore.getState()
    const startedAt = Date.now()
    const providerExpected = getPreferredProvider()

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

      trackEvent('home_menu_recognition_submit', {
        client_request_id: clientRequestId,
        image_count: recognitionImages.length,
        user_language: userLanguage,
        provider_expected: providerExpected,
        is_retry: session.recognitionStatus === 'error',
      }, 'home')

      const menuResult = await recognizeMenu({
        images: recognitionImages.map((image) => ({
          imageBase64: image.imageBase64,
          mimeType: image.mimeType,
        })),
        userLanguage,
        clientRequestId,
        sessionId: sessionStore.getState().sessionId,
      })

      sessionStore.setMenuResult(menuResult)

      trackEvent('home_menu_recognition_success', {
        client_request_id: clientRequestId,
        provider_actual: providerExpected,
        latency_ms: Date.now() - startedAt,
        menu_language: menuResult.menuLanguage,
        currency: menuResult.currency,
        recognized_item_count: menuResult.items.length,
        recognized_category_count: countCategories(menuResult.items),
        prefilled_item_count: countPrefilledItems(menuResult.items),
      }, 'home')

      wx.navigateTo({
        url: '/pages/menu/index',
      })
    } catch (error) {
      sessionStore.setRecognitionStatus('error')
      trackEvent('home_menu_recognition_fail', {
        client_request_id: clientRequestId,
        provider_actual: providerExpected,
        latency_ms: Date.now() - startedAt,
        error_message: error.message || '识别失败',
      }, 'home')
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
    const startedAt = Date.now()

    this.setData({
      isConfigLoading: true,
      configLoadError: '',
      loadingTitle: '正在加载配置',
      loadingSubtitle: '首次进入会先同步服务配置，请稍候',
    })

    trackEvent('home_config_load_start', {
      force_refresh: Boolean(forceRefresh),
    }, 'home')

    try {
      await getApp().ensureEnvReady(forceRefresh)
      this.setData({
        isConfigLoading: false,
        configLoadError: '',
      })
      trackEvent('home_config_load_success', {
        force_refresh: Boolean(forceRefresh),
        latency_ms: Date.now() - startedAt,
        menu_upload_max_count: getMenuImageUploadLimit(),
      }, 'home')
    } catch (error) {
      this.setData({
        isConfigLoading: false,
        configLoadError: error.message || '配置加载失败',
      })
      trackEvent('home_config_load_fail', {
        force_refresh: Boolean(forceRefresh),
        latency_ms: Date.now() - startedAt,
        error_message: error.message || '配置加载失败',
      }, 'home')
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

function countCategories(items) {
  return Array.from(new Set((items || []).map((item) => item.translatedCategory).filter(Boolean))).length
}

function countPrefilledItems(items) {
  return (items || []).filter((item) => Number(item.initialQuantity) > 0).length
}

function inferImageSourceType(sourceType, selectedCount) {
  if (typeof sourceType === 'string' && sourceType) {
    return sourceType
  }

  if (!selectedCount) {
    return 'unknown'
  }

  return selectedCount > 1 ? 'album' : 'camera_or_album'
}
