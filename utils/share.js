function showHomeShareMenu() {
  if (!wx.showShareMenu) {
    return
  }

  wx.showShareMenu({
    menus: ['shareAppMessage', 'shareTimeline'],
  })
}

function hideShareMenu() {
  if (!wx.hideShareMenu) {
    return
  }

  wx.hideShareMenu({
    menus: ['shareAppMessage', 'shareTimeline'],
  })
}

function buildHomeShareContent() {
  return {
    title: '菜单助手：拍照识别菜单，快速完成点餐',
    path: '/pages/home/index',
  }
}

module.exports = {
  buildHomeShareContent,
  hideShareMenu,
  showHomeShareMenu,
}
