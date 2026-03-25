const STORAGE_KEY = 'menu_helper_settings'

const defaultState = {
  userLanguage: '中文',
  orderDisplayMode: 'original',
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
  return Object.assign({}, state)
}

function setUserLanguage(userLanguage) {
  state = Object.assign({}, state, { userLanguage })
  persist()
  return getState()
}

function setOrderDisplayMode(orderDisplayMode) {
  state = Object.assign({}, state, { orderDisplayMode })
  persist()
  return getState()
}

module.exports = {
  getState,
  setUserLanguage,
  setOrderDisplayMode,
}
