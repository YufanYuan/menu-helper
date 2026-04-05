const { isExchangeRateReferenceEnabled } = require('../../config/features')
const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { formatPrice } = require('../../domain/menu')
const { getReferenceRate } = require('../../services/exchange-rate')
const { hideShareMenu } = require('../../utils/share')
const { trackEvent } = require('../../utils/analytics')
const {
  extractDeviceLocale,
  findCurrencyIndex,
  formatCurrencyAmount,
  getCurrencyOptionLabels,
  getCurrencyOptions,
  normalizeCurrencyCode,
  resolveDefaultDisplayCurrency,
} = require('../../utils/currency')

Page({
  data: {
    items: [],
    totalCount: 0,
    totalPriceLabel: '0.00',
    isExchangeRateEnabled: false,
    menuCurrency: '',
    displayCurrency: '',
    currencyOptions: [],
    currencyOptionLabels: [],
    selectedCurrencyIndex: 0,
    referencePriceLabel: '',
    referenceMetaLabel: '',
    referenceError: '',
    isReferenceLoading: false,
  },

  onShow() {
    const summary = sessionStore.getSummary()
    const session = sessionStore.getState()
    const exchangeRateEnabled = isExchangeRateReferenceEnabled() && Boolean(normalizeCurrencyCode(session.currency))

    hideShareMenu()
    this.refreshData()
    trackEvent('order_preview_page_view', {
      cart_total_count: summary.totalCount,
      distinct_item_count: summary.cartItems.length,
      total_price: summary.totalPrice,
      exchange_rate_enabled: exchangeRateEnabled,
    }, 'order_preview')
  },

  refreshData() {
    const session = sessionStore.getState()
    const settings = settingsStore.getState()
    const summary = sessionStore.getSummary()
    const menuCurrency = normalizeCurrencyCode(session.currency)
    const isExchangeRateEnabled = isExchangeRateReferenceEnabled() && Boolean(menuCurrency)
    const displayCurrency = isExchangeRateEnabled
      ? resolveDefaultDisplayCurrency({
        preferredCurrency: settings.preferredCurrency,
        locale: extractDeviceLocale(),
        userLanguage: settings.userLanguage,
        menuCurrency,
      })
      : ''
    const currencyOptions = isExchangeRateEnabled ? getCurrencyOptions(menuCurrency) : []
    const currencyOptionLabels = isExchangeRateEnabled ? getCurrencyOptionLabels(menuCurrency) : []

    this.setData({
      items: summary.cartItems.map((item) => ({
        ...item,
        priceLabel: formatPrice(item, menuCurrency),
        subtotalLabel: formatCurrencyAmount(item.subtotal, menuCurrency),
      })),
      totalCount: summary.totalCount,
      totalPriceLabel: formatCurrencyAmount(summary.totalPrice, menuCurrency),
      isExchangeRateEnabled,
      menuCurrency,
      displayCurrency,
      currencyOptions,
      currencyOptionLabels,
      selectedCurrencyIndex: isExchangeRateEnabled
        ? findCurrencyIndex(displayCurrency, currencyOptions)
        : 0,
      referencePriceLabel: isExchangeRateEnabled ? this.data.referencePriceLabel : '',
      referenceMetaLabel: isExchangeRateEnabled ? this.data.referenceMetaLabel : '',
      referenceError: isExchangeRateEnabled ? this.data.referenceError : '',
      isReferenceLoading: false,
    }, () => {
      if (isExchangeRateEnabled) {
        this.loadReferencePrice()
        return
      }

      this.referenceRequestId = (this.referenceRequestId || 0) + 1
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

  handleCurrencyChange(event) {
    const selectedCurrencyIndex = Number(event.detail.value) || 0
    const selectedCurrency = this.data.currencyOptions[selectedCurrencyIndex]

    if (!selectedCurrency) {
      return
    }

    settingsStore.setPreferredCurrency(selectedCurrency.code)
    this.setData({
      displayCurrency: selectedCurrency.code,
      selectedCurrencyIndex,
    }, () => {
      this.loadReferencePrice()
    })

    trackEvent('order_preview_reference_currency_select', {
      selected_currency: selectedCurrency.code,
      menu_currency: this.data.menuCurrency,
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
      exchange_rate_enabled: this.data.isExchangeRateEnabled,
      reference_currency: this.data.displayCurrency,
    }, 'order_preview')
    wx.navigateTo({
      url: '/pages/order-card/index',
    })
  },

  handleBackToMenu() {
    navigateBackOrHome()
  },

  async loadReferencePrice() {
    this.referenceRequestId = (this.referenceRequestId || 0) + 1
    const currentRequestId = this.referenceRequestId
    const summary = sessionStore.getSummary()
    const totalPrice = Number(summary.totalPrice) || 0
    const menuCurrency = normalizeCurrencyCode(this.data.menuCurrency)
    const displayCurrency = normalizeCurrencyCode(this.data.displayCurrency)

    if (!this.data.isExchangeRateEnabled || !totalPrice || !menuCurrency || !displayCurrency) {
      this.setData({
        referencePriceLabel: '',
        referenceMetaLabel: '',
        referenceError: '',
        isReferenceLoading: false,
      })
      return
    }

    if (menuCurrency === displayCurrency) {
      this.setData({
        referencePriceLabel: '',
        referenceMetaLabel: '当前展示的就是菜单原币种金额',
        referenceError: '',
        isReferenceLoading: false,
      })
      return
    }

    this.setData({
      isReferenceLoading: true,
      referenceError: '',
      referenceMetaLabel: '正在获取参考汇率…',
    })

    try {
      const referenceRate = await getReferenceRate({
        baseCurrency: menuCurrency,
        quoteCurrency: displayCurrency,
      })

      if (currentRequestId !== this.referenceRequestId) {
        return
      }

      this.setData({
        referencePriceLabel: formatCurrencyAmount(totalPrice * referenceRate.rate, displayCurrency),
        referenceMetaLabel: buildReferenceMetaLabel(referenceRate),
        referenceError: '',
        isReferenceLoading: false,
      })
    } catch (error) {
      if (currentRequestId !== this.referenceRequestId) {
        return
      }

      this.setData({
        referencePriceLabel: '',
        referenceMetaLabel: '',
        referenceError: '参考汇率暂时不可用，请稍后重试',
        isReferenceLoading: false,
      })
    }
  },
})

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

function buildReferenceMetaLabel(referenceRate) {
  const parts = []

  if (referenceRate.rateDate) {
    parts.push(`参考汇率日期 ${referenceRate.rateDate}`)
  }

  if (referenceRate.source) {
    parts.push(`来源 ${referenceRate.source}`)
  }

  return parts.join(' · ')
}
