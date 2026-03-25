App({
  onLaunch() {
    this.globalData.deviceInfo = wx.getSystemInfoSync()
  },
  globalData: {
    deviceInfo: null
  }
})
