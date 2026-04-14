const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { hideShareMenu } = require('../../utils/share')

const switchOptions = [
  { label: '当地语言', value: 'original' },
  { label: '我的语言', value: 'translated' },
]

Page({
  data: {
    displayMode: 'original',
    switchOptions,
    items: [],
    orderSummaryText: '',
  },

  onShow() {
    hideShareMenu()
    this.refreshData()
  },

  refreshData() {
    const settings = settingsStore.getState()
    const summary = sessionStore.getSummary()

    const items = summary.cartItems.map((item) => ({
      ...item,
      displayName: settings.orderDisplayMode === 'translated' && item.translatedName ? item.translatedName : item.originalName,
    }))

    this.setData({
      displayMode: settings.orderDisplayMode,
      items,
      orderSummaryText: buildOrderText(items, settings.orderDisplayMode),
    })
  },

  handleModeChange(event) {
    settingsStore.setOrderDisplayMode(event.detail.value)
    this.refreshData()
  },

  handleCopy() {
    if (!this.data.orderSummaryText) {
      wx.showToast({
        title: '当前没有内容可复制',
        icon: 'none',
      })
      return
    }

    wx.setClipboardData({
      data: this.data.orderSummaryText,
    })
  },

  handleBackToPreview() {
    navigateBackOrHome()
  },
})

function buildOrderText(items) {
  if (!items.length) {
    return ''
  }

  return items.map((item) => `${item.quantity} x ${item.displayName}`).join('\n')
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
