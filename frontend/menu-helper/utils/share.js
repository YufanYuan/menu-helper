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

function showAppMessageShareMenu() {
  if (!wx.showShareMenu) {
    return
  }

  wx.showShareMenu({
    menus: ['shareAppMessage'],
  })
}

function buildHomeShareContent() {
  return {
    title: '菜单助手：拍照识别菜单，快速完成点餐',
    path: '/pages/home/index',
  }
}

function buildRoomShareContent(roomId) {
  if (!roomId) {
    return buildHomeShareContent()
  }

  return {
    title: '一起来点餐：菜单已识别，打开即可加入房间',
    path: `/pages/menu/index?roomId=${encodeURIComponent(roomId)}`,
  }
}

module.exports = {
  buildRoomShareContent,
  buildHomeShareContent,
  hideShareMenu,
  showAppMessageShareMenu,
  showHomeShareMenu,
}
