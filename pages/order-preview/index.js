const sessionStore = require('../../store/session-store')
const { formatPrice } = require('../../domain/menu')
const { hideShareMenu } = require('../../utils/share')
const { trackEvent } = require('../../utils/analytics')

Page({
  data: {
    items: [],
    totalCount: 0,
    totalPriceLabel: '0.00',
    currency: '',
  },

  onShow() {
    hideShareMenu()
    this.refreshData()
    trackEvent('order_preview_page_view', {
      cart_total_count: sessionStore.getSummary().totalCount,
      distinct_item_count: sessionStore.getSummary().cartItems.length,
      total_price: sessionStore.getSummary().totalPrice,
    }, 'order_preview')
  },

  refreshData() {
    const session = sessionStore.getState()
    const summary = sessionStore.getSummary()

    this.setData({
      items: summary.cartItems.map((item) => ({
        ...item,
        priceLabel: formatPrice(item, session.currency),
        subtotalLabel: buildTotalPriceLabel(item.subtotal, session.currency),
      })),
      totalCount: summary.totalCount,
      totalPriceLabel: buildTotalPriceLabel(summary.totalPrice, session.currency),
      currency: session.currency,
    })
  },

  handleQuantityChange(event) {
    const itemId = event.currentTarget.dataset.itemId
    const previousQuantity = Number(sessionStore.getState().cart[itemId] || 0)
    sessionStore.updateQuantity(itemId, event.detail.value)
    this.refreshData()
    const summary = sessionStore.getSummary()
    const item = summary.cartItems.find((cartItem) => cartItem.id === itemId)
      || sessionStore.getState().items.find((currentItem) => currentItem.id === itemId)
      || {}
    const nextQuantity = Number(event.detail.value) || 0

    trackEvent('order_preview_item_update', {
      item_id: itemId,
      item_name: item.translatedName || item.originalName || '',
      previous_quantity: previousQuantity,
      new_quantity: nextQuantity,
      quantity_delta: nextQuantity - previousQuantity,
      cart_total_count: summary.totalCount,
      total_price: summary.totalPrice,
    }, 'order_preview')
  },

  handleConfirm() {
    if (!this.data.totalCount) {
      wx.showToast({
        title: '还没有已选菜品',
        icon: 'none',
      })
      return
    }

    trackEvent('order_preview_confirm', {
      cart_total_count: this.data.totalCount,
      distinct_item_count: this.data.items.length,
      total_price: parsePriceLabel(this.data.totalPriceLabel),
    }, 'order_preview')
    wx.navigateTo({
      url: '/pages/order-card/index',
    })
  },

  handleBackToMenu() {
    navigateBackOrHome()
  },
})

function buildTotalPriceLabel(totalPrice, currency) {
  if (currency) {
    return `${currency} ${totalPrice.toFixed(2)}`
  }
  return totalPrice.toFixed(2)
}

function parsePriceLabel(value) {
  const match = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)$/)
  return match ? Number(match[1]) : 0
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
