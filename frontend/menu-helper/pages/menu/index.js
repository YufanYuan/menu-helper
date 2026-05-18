const sessionStore = require('../../store/session-store')
const settingsStore = require('../../store/settings-store')
const { ALL_CATEGORY, buildCategories, filterItemsByCategory, formatPrice } = require('../../domain/menu')
const roomClient = require('../../services/room-client')
const { buildRoomShareContent, showAppMessageShareMenu } = require('../../utils/share')
const { trackEvent } = require('../../utils/analytics')

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
    pendingRoomId: '',
    roomId: '',
    roomStatus: 'idle',
    roomStatusText: '',
    roomShareReady: false,
    roomControlsDisabled: false,
  },

  onLoad(options) {
    this.unsubscribeRoom = roomClient.subscribe(() => {
      this.refreshData()
    })

    if (options && options.roomId) {
      this.setData({
        pendingRoomId: decodeURIComponent(options.roomId),
      })
    }
  },

  onUnload() {
    if (this.unsubscribeRoom) {
      this.unsubscribeRoom()
      this.unsubscribeRoom = null
    }
  },

  onReady() {
    this.updateMenuListHeight()
  },

  onShow() {
    showAppMessageShareMenu()

    const session = sessionStore.getState()
    if (this.data.pendingRoomId && session.room.roomId !== this.data.pendingRoomId) {
      this.joinSharedRoom(this.data.pendingRoomId)
      return
    }

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
        roomId: '',
        roomStatus: 'idle',
        roomStatusText: '',
        roomShareReady: false,
        roomControlsDisabled: false,
      })
      trackEvent('menu_page_view', {
        has_menu: false,
        recognized_item_count: 0,
        cart_total_count: 0,
      }, 'menu')
      return
    }

    this.refreshData()
    this.updateMenuListHeight()
    this.ensureRoomReady()
    const summary = sessionStore.getSummary()
    trackEvent('menu_page_view', {
      has_menu: true,
      menu_language: session.menuLanguage,
      recognized_item_count: session.items.length,
      recognized_category_count: buildCategories(session.items).length - 1,
      cart_total_count: summary.totalCount,
      distinct_item_count: summary.cartItems.length,
    }, 'menu')
  },

  onShareAppMessage() {
    const roomId = sessionStore.getState().room.roomId
    trackEvent('share_room_app_message', {
      share_channel: 'app_message',
      room_ready: Boolean(roomId),
    }, 'menu')
    return buildRoomShareContent(roomId)
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
      attribution: session.attributions[item.id] || null,
    }))
    const roomStatus = session.room.status || 'idle'

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
      roomId: session.room.roomId,
      roomStatus,
      roomStatusText: buildRoomStatusText(roomStatus, session.room.lastError),
      roomShareReady: Boolean(session.room.roomId),
      roomControlsDisabled: Boolean(session.room.roomId) && roomStatus !== 'connected',
    }, () => this.updateMenuListHeight())
  },

  ensureRoomReady() {
    const session = sessionStore.getState()
    if (!session.items.length || session.room.roomId || session.room.status === 'connecting') {
      return
    }

    roomClient.connectCreateRoom({
      menuLanguage: session.menuLanguage,
      currency: session.currency,
      items: session.items,
    }, session.cart).then(() => {
      this.refreshData()
      trackEvent('room_create_success', {
        room_id: sessionStore.getState().room.roomId,
      }, 'menu')
    }).catch((error) => {
      this.refreshData()
      trackEvent('room_create_fail', {
        error_message: error.message || '房间创建失败',
      }, 'menu')
      wx.showToast({
        title: error.message || '房间创建失败',
        icon: 'none',
      })
    })
  },

  joinSharedRoom(roomId) {
    if (!roomId) {
      return
    }

    this.setData({
      pendingRoomId: roomId,
      hasMenu: true,
      roomStatus: 'connecting',
      roomStatusText: '正在加入点餐房间',
      roomControlsDisabled: true,
    })

    roomClient.connectJoinRoom(roomId).then(() => {
      this.setData({ pendingRoomId: '' })
      this.refreshData()
      trackEvent('room_join_success', {
        room_id: roomId,
      }, 'menu')
    }).catch((error) => {
      this.refreshData()
      trackEvent('room_join_fail', {
        room_id: roomId,
        error_message: error.message || '加入房间失败',
      }, 'menu')
      wx.showModal({
        title: '房间不可用',
        content: error.message || '点餐房间已失效，请让朋友重新分享。',
        confirmText: '回到首页',
        showCancel: false,
        success: () => {
          sessionStore.clearSession()
          wx.reLaunch({
            url: '/pages/home/index',
          })
        },
      })
    })
  },

  handleCategoryTap(event) {
    const nextCategory = event.currentTarget.dataset.category
    if (!nextCategory || nextCategory === this.data.activeCategory) {
      return
    }

    trackEvent('menu_category_switch', {
      previous_category: this.data.activeCategory,
      next_category: nextCategory,
    }, 'menu')
    this.resetMenuScrollTop()
    this.refreshData(nextCategory)
  },

  handleInviteTap() {
    roomClient.prepareMemberProfile().then(() => {
      const session = sessionStore.getState()
      if (!session.room.roomId) {
        this.ensureRoomReady()
      }
    })
  },

  handleQuantityChange(event) {
    const { itemId, value } = event.detail
    const session = sessionStore.getState()
    const previousQuantity = Number(session.cart[itemId] || 0)
    const nextQuantity = Math.max(0, Number(value) || 0)

    if (session.room.roomId) {
      if (session.room.status !== 'connected') {
        wx.showToast({
          title: '房间重连中，暂时不能修改',
          icon: 'none',
        })
        return
      }

      roomClient.adjustItemQuantity(itemId, nextQuantity - previousQuantity).catch((error) => {
        wx.showToast({
          title: error.message || '同步失败',
          icon: 'none',
        })
      })
      return
    }

    sessionStore.updateQuantity(itemId, nextQuantity)
    this.syncQuantityState(itemId, nextQuantity)
    trackCartChange(itemId, previousQuantity, nextQuantity)
  },

  handlePreview() {
    if (!this.data.totalCount) {
      wx.showToast({
        title: '请先选择菜品',
        icon: 'none',
      })
      return
    }

    trackEvent('menu_preview_enter', {
      cart_total_count: this.data.totalCount,
      total_price: parsePriceLabel(this.data.totalPriceLabel),
      distinct_item_count: sessionStore.getSummary().cartItems.length,
    }, 'menu')
    wx.navigateTo({
      url: '/pages/order-preview/index',
    })
  },

  handleRestart() {
    trackEvent('menu_session_restart', {
      restart_reason: 'empty_restart',
      cart_total_count: this.data.totalCount,
      recognized_item_count: sessionStore.getState().items.length,
    }, 'menu')
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

        trackEvent('menu_session_restart', {
          restart_reason: 'back_confirm',
          cart_total_count: this.data.totalCount,
          recognized_item_count: sessionStore.getState().items.length,
        }, 'menu')
        roomClient.closeSocket(true)
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

function buildRoomStatusText(status, lastError) {
  if (status === 'connected') {
    return '多人点餐已同步'
  }
  if (status === 'connecting') {
    return '正在创建点餐房间'
  }
  if (status === 'reconnecting') {
    return '房间重连中'
  }
  if (status === 'error') {
    return lastError || '房间同步不可用'
  }
  return ''
}

function parsePriceLabel(value) {
  const match = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)$/)
  return match ? Number(match[1]) : 0
}

function trackCartChange(itemId, previousQuantity, nextQuantity) {
  const session = sessionStore.getState()
  const summary = sessionStore.getSummary()
  const item = session.items.find((currentItem) => currentItem.id === itemId) || {}
  const safeNextQuantity = Math.max(0, Number(nextQuantity) || 0)
  let eventId = 'menu_cart_item_update'

  if (previousQuantity === 0 && safeNextQuantity > 0) {
    eventId = 'menu_cart_item_add'
  } else if (previousQuantity > 0 && safeNextQuantity === 0) {
    eventId = 'menu_cart_item_remove'
  }

  trackEvent(eventId, {
    item_id: itemId,
    item_name: item.translatedName || item.originalName || '',
    item_category: item.translatedCategory || '',
    item_price: Number(item.priceValue) || 0,
    previous_quantity: previousQuantity,
    new_quantity: safeNextQuantity,
    quantity_delta: safeNextQuantity - previousQuantity,
    cart_total_count: summary.totalCount,
    cart_total_price: summary.totalPrice,
  }, 'menu')
}
