const settingsStore = require('./store/settings-store')

function normalizeCountry(value) {
  if (typeof value !== 'string') {
    return 'INTL'
  }

  const code = value.trim().toUpperCase()
  return code === 'CN' || code === 'RU' ? code : 'INTL'
}

App({
  onLaunch() {
    this.globalData.deviceInfo = wx.getSystemInfoSync()
    this.resolveClientCountry()
  },
  resolveClientCountry() {
    wx.request({
      url: 'https://api.country.is/',
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        const country = normalizeCountry(res && res.data && res.data.country)
        settingsStore.setClientCountry(country)
      },
      fail: () => {
        settingsStore.setClientCountry('INTL')
      },
    })
  },
  globalData: {
    deviceInfo: null,
  },
})
