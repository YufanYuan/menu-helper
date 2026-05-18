const { setItemQuantity, getCartSummary } = require('../domain/cart')

const STORAGE_KEY = 'menu_helper_session'

const defaultState = {
  sessionId: '',
  imagePath: '',
  imagePaths: [],
  mimeType: '',
  images: [],
  menuLanguage: '',
  currency: '',
  items: [],
  cart: {},
  attributions: {},
  room: {
    roomId: '',
    memberId: '',
    status: 'idle',
    lastError: '',
    version: 0,
  },
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
    imagePaths: state.imagePaths.slice(),
    images: state.images.map((image) => Object.assign({}, image)),
    items: state.items.slice(),
    cart: Object.assign({}, state.cart),
    attributions: Object.assign({}, state.attributions),
    room: Object.assign({}, state.room),
  }
}

function setDraftImages(images) {
  const draftImages = (images || [])
    .filter((image) => image && image.imagePath)
    .map((image) => ({
      imagePath: image.imagePath,
      mimeType: image.mimeType || '',
    }))
  const [firstImage] = draftImages

  state = Object.assign({}, defaultState, {
    imagePath: firstImage ? firstImage.imagePath : '',
    imagePaths: draftImages.map((image) => image.imagePath),
    mimeType: firstImage ? firstImage.mimeType : '',
    images: draftImages,
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
    attributions: {},
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

function setRoomStatus(status, lastError) {
  state = Object.assign({}, state, {
    room: Object.assign({}, state.room, {
      status,
      lastError: lastError || '',
    }),
  })
  persist()
  return getState()
}

function applyRoomSnapshot(snapshot, memberId, status) {
  if (!snapshot || !snapshot.menu || !Array.isArray(snapshot.menu.items)) {
    return getState()
  }

  state = Object.assign({}, state, {
    menuLanguage: snapshot.menu.menuLanguage,
    currency: snapshot.menu.currency,
    items: snapshot.menu.items,
    cart: Object.assign({}, snapshot.cart || {}),
    attributions: Object.assign({}, snapshot.attributions || {}),
    recognitionStatus: 'ready',
    recognizedAt: snapshot.createdAt || state.recognizedAt || new Date().toISOString(),
    room: Object.assign({}, state.room, {
      roomId: snapshot.roomId || state.room.roomId,
      memberId: memberId || state.room.memberId,
      status: status || state.room.status || 'connected',
      lastError: '',
      version: Number(snapshot.version) || state.room.version || 0,
    }),
  })
  persist()
  return getState()
}

function applyRoomCartUpdate(payload) {
  if (!payload || !payload.roomId || payload.roomId !== state.room.roomId) {
    return getState()
  }

  state = Object.assign({}, state, {
    cart: Object.assign({}, payload.cart || {}),
    attributions: Object.assign({}, payload.attributions || {}),
    room: Object.assign({}, state.room, {
      status: 'connected',
      lastError: '',
      version: Number(payload.version) || state.room.version,
    }),
  })
  persist()
  return getState()
}

function clearRoom() {
  state = Object.assign({}, state, {
    attributions: {},
    room: Object.assign({}, defaultState.room),
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
  setDraftImages,
  setRecognitionStatus,
  setMenuResult,
  updateQuantity,
  setRoomStatus,
  applyRoomSnapshot,
  applyRoomCartUpdate,
  clearRoom,
  clearSession,
  getSummary,
}
