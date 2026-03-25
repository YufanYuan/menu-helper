const sessionStore = require('../../store/session-store')
const { formatPrice } = require('../../domain/menu')

Page({
  data: {
    items: [],
    totalCount: 0,
    totalPriceLabel: '0.00',
    currency: '',
  },

  onShow() {
    this.refreshData()
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
    sessionStore.updateQuantity(event.currentTarget.dataset.itemId, event.detail.value)
    this.refreshData()
  },

  handleConfirm() {
    if (!this.data.totalCount) {
      wx.showToast({
        title: '还没有已选菜品',
        icon: 'none',
      })
      return
    }

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
