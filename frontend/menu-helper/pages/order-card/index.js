const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const roomClient = require('../../services/room-client')
const { hideShareMenu } = require('../../utils/share')
const { trackEvent } = require('../../utils/analytics')

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

  onLoad() {
    this.unsubscribeRoom = roomClient.subscribe(() => {
      this.refreshData()
    })
  },

  onUnload() {
    if (this.unsubscribeRoom) {
      this.unsubscribeRoom()
      this.unsubscribeRoom = null
    }
  },

  onShow() {
    hideShareMenu()
    this.refreshData()
    const summary = sessionStore.getSummary()
    trackEvent('order_card_page_view', {
      display_mode: settingsStore.getState().orderDisplayMode,
      cart_total_count: summary.totalCount,
      distinct_item_count: summary.cartItems.length,
    }, 'order_card')
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
    const previousMode = this.data.displayMode
    settingsStore.setOrderDisplayMode(event.detail.value)
    this.refreshData()
    trackEvent('order_card_mode_switch', {
      previous_display_mode: previousMode,
      display_mode: event.detail.value,
      item_count: this.data.items.length,
    }, 'order_card')
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
    trackEvent('order_card_copy', {
      display_mode: this.data.displayMode,
      item_count: this.data.items.length,
      text_length: this.data.orderSummaryText.length,
      cart_total_count: sessionStore.getSummary().totalCount,
    }, 'order_card')
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
