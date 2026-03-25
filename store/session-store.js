const { setItemQuantity, getCartSummary } = require('../domain/cart')

const STORAGE_KEY = 'menu_helper_session'

const defaultState = {
  sessionId: '',
  imagePath: '',
  mimeType: '',
  menuLanguage: '',
  currency: '',
  items: [],
  cart: {},
  recognitionStatus: 'idle',
  recognizedAt: '',
}

let state = hydrate()

function hydrate() {
  const saved = wx.getStorageSync(STORAGE_KEY) || {}
  return Object.assign({}, defaultState, saved)
}

function persist() {
  wx.setStorageSync(STORAGE_KEY, state)
}

function getState() {
  return {
    ...state,
    items: state.items.slice(),
    cart: Object.assign({}, state.cart),
  }
}

function setDraftImage({ imagePath, mimeType }) {
  state = Object.assign({}, defaultState, {
    imagePath,
    mimeType,
    recognitionStatus: 'draft',
    sessionId: `session_${Date.now()}`,
  })
  persist()
  return getState()
}

function setRecognitionStatus(recognitionStatus) {
  state = Object.assign({}, state, { recognitionStatus })
  persist()
  return getState()
}

function setMenuResult(payload) {
  const initialCart = {}
  payload.items.forEach((item) => {
    if (item.initialQuantity > 0) {
      initialCart[item.id] = item.initialQuantity
    }
  })

  state = Object.assign({}, state, {
    menuLanguage: payload.menuLanguage,
    currency: payload.currency,
    items: payload.items,
    cart: initialCart,
    recognitionStatus: 'ready',
    recognizedAt: new Date().toISOString(),
  })
  persist()
  return getState()
}

function updateQuantity(itemId, quantity) {
  state = Object.assign({}, state, {
    cart: setItemQuantity(state.cart, itemId, quantity),
  })
  persist()
  return getState()
}

function clearSession() {
  state = Object.assign({}, defaultState)
  persist()
  return getState()
}

function getSummary() {
  return getCartSummary(state.items, state.cart)
}

module.exports = {
  getState,
  setDraftImage,
  setRecognitionStatus,
  setMenuResult,
  updateQuantity,
  clearSession,
  getSummary,
}
