const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { ALL_CATEGORY, buildCategories, filterItemsByCategory, formatPrice } = require('../../domain/menu')
const { hideShareMenu } = require('../../utils/share')

const LANGUAGE_LABELS = {
  ar: 'العربية',
  chinese: '中文',
  en: 'English',
  english: 'English',
  es: 'Español',
  french: 'French',
  fr: 'French',
  italian: 'Italiano',
  it: 'Italiano',
  ja: '日本語',
  japanese: '日本語',
  ko: '한국어',
  korean: '한국어',
  zh: '中文',
  'zh-cn': '中文',
}

Page({
  data: {
    imagePath: '',
    imagePaths: [],
    imageCount: 0,
    menuLanguage: '',
    menuLanguageLabel: '未知',
    userLanguage: '',
    categories: [ALL_CATEGORY],
    activeCategory: ALL_CATEGORY,
    items: [],
    totalCount: 0,
    totalPriceLabel: '0.00',
    hasMenu: false,
    menuListHeight: 320,
    menuScrollTop: 0,
  },

  onReady() {
    this.updateMenuListHeight()
  },

  onShow() {
    hideShareMenu()

    const session = sessionStore.getState()
    if (!session.items.length) {
      this.setData({
        hasMenu: false,
        imagePath: '',
        imagePaths: [],
        imageCount: 0,
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        items: [],
        totalCount: 0,
        totalPriceLabel: '0.00',
        menuScrollTop: 0,
      })
      return
    }

    this.refreshData()
    this.updateMenuListHeight()
  },

  refreshData(nextCategory) {
    const session = sessionStore.getState()
    const settings = settingsStore.getState()
    const categories = buildCategories(session.items)
    const currentCategory = nextCategory || this.data.activeCategory
    const activeCategory = categories.includes(currentCategory) ? currentCategory : ALL_CATEGORY
    const summary = sessionStore.getSummary()
    const items = filterItemsByCategory(session.items, activeCategory).map((item) => ({
      ...item,
      quantity: session.cart[item.id] || 0,
      priceLabel: formatPrice(item, session.currency),
    }))

    this.setData({
      hasMenu: session.items.length > 0,
      imagePath: session.imagePath,
      menuLanguage: session.menuLanguage,
      menuLanguageLabel: formatLanguageLabel(session.menuLanguage),
      userLanguage: settings.userLanguage,
      categories,
      activeCategory,
      items,
      totalCount: summary.totalCount,
      totalPriceLabel: buildTotalPriceLabel(summary.totalPrice, session.currency),
      menuScrollTop: this.data.menuScrollTop,
      imagePaths: session.imagePaths,
      imageCount: session.imagePaths.length,
    }, () => this.updateMenuListHeight())
  },

  handleCategoryTap(event) {
    const nextCategory = event.currentTarget.dataset.category
    if (!nextCategory || nextCategory === this.data.activeCategory) {
      return
    }

    this.resetMenuScrollTop()
    this.refreshData(nextCategory)
  },

  handleQuantityChange(event) {
    const { itemId, value } = event.detail
    sessionStore.updateQuantity(itemId, value)
    this.syncQuantityState(itemId, value)
  },

  handlePreview() {
    if (!this.data.totalCount) {
      wx.showToast({
        title: '请先选择菜品',
        icon: 'none',
      })
      return
    }

    wx.navigateTo({
      url: '/pages/order-preview/index',
    })
  },

  handleRestart() {
    navigateBackOrHome()
  },

  handleBackAttempt() {
    if (!this.data.hasMenu) {
      navigateBackOrHome()
      return
    }

    wx.showModal({
      title: '确认返回首页',
      content: '返回首页后，本次识别的菜单和已选菜品将不会保留。是否继续返回？',
      confirmText: '返回首页',
      cancelText: '继续点餐',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        sessionStore.clearSession()
        navigateBackOrHome()
      },
    })
  },

  updateMenuListHeight() {
    if (!this.data.hasMenu) {
      return
    }

    const query = wx.createSelectorQuery().in(this)
    query.select('.page-shell').boundingClientRect()
    query.select('#summary-card').boundingClientRect()
    query.select('#category-row').boundingClientRect()
    query.select('#cart-bar').boundingClientRect()
    query.exec((res) => {
      const [shellRect, summaryRect, categoryRect, cartRect] = res || []
      if (!shellRect) {
        return
      }

      const safeBottom = (wx.getSystemInfoSync().safeAreaInsets || {}).bottom || 0
      const shellHeight = shellRect.height || 0
      const summaryHeight = summaryRect ? summaryRect.height : 0
      const categoryHeight = categoryRect ? categoryRect.height : 0
      const cartHeight = cartRect ? cartRect.height : 0
      const reservedHeight = summaryHeight + categoryHeight + cartHeight + 72 + safeBottom
      const menuListHeight = Math.max(220, Math.floor(shellHeight - reservedHeight))

      if (menuListHeight !== this.data.menuListHeight) {
        this.setData({ menuListHeight })
      }
    })
  },

  resetMenuScrollTop() {
    this.setData({ menuScrollTop: 1 }, () => {
      this.setData({ menuScrollTop: 0 })
    })
  },

  syncQuantityState(itemId, quantity) {
    const summary = sessionStore.getSummary()
    const itemIndex = this.data.items.findIndex((item) => item.id === itemId)
    const nextData = {
      totalCount: summary.totalCount,
      totalPriceLabel: buildTotalPriceLabel(summary.totalPrice, sessionStore.getState().currency),
    }

    if (itemIndex === -1) {
      this.refreshData()
      return
    }

    nextData[`items[${itemIndex}].quantity`] = quantity
    this.setData(nextData)
  },
})

function buildTotalPriceLabel(totalPrice, currency) {
  if (currency) {
    return `${currency} ${totalPrice.toFixed(2)}`
  }
  return totalPrice.toFixed(2)
}

function navigateBackOrHome() {
  if (getCurrentPages().length > 1) {
    wx.navigateBack({
      delta: 1,
    })
    return
  }

  wx.reLaunch({
    url: '/pages/home/index',
  })
}

function formatLanguageLabel(value) {
  const label = String(value || '').trim()
  if (!label) {
    return '未知'
  }

  return LANGUAGE_LABELS[label.toLowerCase()] || label
}
