const env = require('../config/env')
const sessionStore = require('../store/session-store')
const settingsStore = require('../store/settings-store')

const PROFILE_STORAGE_KEY = 'menu_helper_room_profile'
const HEARTBEAT_INTERVAL_MS = 25000
const RECONNECT_DELAY_MS = 1500
const AVATAR_COLORS = ['#182126', '#3f6f63', '#b85c38', '#5d6f9f', '#8a5a83']

let socketTask = null
let heartbeatTimer = null
let reconnectTimer = null
let manualClose = false
let activeRequest = null
let listeners = []

function subscribe(listener) {
  if (typeof listener !== 'function') {
    return function noop() {}
  }

  listeners.push(listener)
  return function unsubscribe() {
    listeners = listeners.filter((current) => current !== listener)
  }
}

function emit(event, payload) {
  listeners.forEach((listener) => {
    try {
      listener(event, payload)
    } catch (error) {
      console.warn('[room-client] listener failed', error)
    }
  })
}

function connectCreateRoom(menu, cart) {
  return connect({
    mode: 'create',
    menu,
    cart,
  })
}

function connectJoinRoom(roomId) {
  return connect({
    mode: 'join',
    roomId,
  })
}

function prepareMemberProfile() {
  if (!wx.getUserProfile) {
    return getMemberProfile()
  }

  return new Promise((resolve) => {
    wx.getUserProfile({
      desc: '用于点餐房间头像展示',
      success: (res) => {
        const userInfo = res.userInfo || {}
        const profile = Object.assign({}, buildAnonymousProfile(), {
          nickName: userInfo.nickName || '',
          avatarUrl: userInfo.avatarUrl || '',
        })
        wx.setStorageSync(PROFILE_STORAGE_KEY, profile)
        syncMemberProfile(profile)
        resolve(profile)
      },
      fail: () => {
        getMemberProfile().then(resolve)
      },
    })
  })
}

function syncMemberProfile(profile) {
  const session = sessionStore.getState()
  if (!session.room.roomId || session.room.status !== 'connected' || !socketTask) {
    return
  }

  sendRaw({
    type: 'update_member_profile',
    requestId: createRequestId('room_profile'),
    member: profile,
  }).catch(() => {})
}

function connect(request) {
  closeSocket(false)
  manualClose = false
  activeRequest = request
  sessionStore.setRoomStatus('connecting')
  emit('status', sessionStore.getState())

  return ensureEnvReady()
    .then(() => Promise.all([loginWithWeChat(), getMemberProfile()]))
    .then(([wechatCode, member]) => openSocket(request, wechatCode, member))
    .catch((error) => {
      sessionStore.setRoomStatus('error', error.message || '房间连接失败')
      emit('error', error)
      throw error
    })
}

function ensureEnvReady() {
  if (env.isReady()) {
    return Promise.resolve(env)
  }

  const app = typeof getApp === 'function' ? getApp() : null
  if (app && typeof app.ensureEnvReady === 'function') {
    return app.ensureEnvReady()
  }

  return Promise.reject(new Error('配置尚未加载完成，请稍后重试'))
}

function openSocket(request, wechatCode, member) {
  const socketUrl = buildSocketUrl(request.mode === 'join' ? request.roomId : '')

  return new Promise((resolve, reject) => {
    let settled = false
    const task = wx.connectSocket({
      url: socketUrl,
      fail: () => {
        rejectOnce(new Error('房间连接失败，请检查网络或域名配置'))
      },
    })

    socketTask = task

    task.onOpen(() => {
      const message = request.mode === 'create'
        ? {
          type: 'create_room',
          requestId: createRequestId('room_create'),
          wechatCode,
          member,
          menu: request.menu,
          cart: request.cart,
        }
        : {
          type: 'join_room',
          requestId: createRequestId('room_join'),
          roomId: request.roomId,
          wechatCode,
          member,
        }

      sendRaw(message)
      startHeartbeat()
    })

    task.onMessage((event) => {
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch (error) {
        console.warn('[room-client] invalid message', error)
        return
      }

      handleServerMessage(payload)

      if (!settled && (payload.type === 'room_created' || payload.type === 'room_joined')) {
        settled = true
        activeRequest = {
          mode: 'join',
          roomId: payload.roomId,
        }
        resolve(payload)
      } else if (!settled && payload.type === 'room_error') {
        rejectOnce(new Error(payload.message || '房间连接失败'))
      }
    })

    task.onClose(() => {
      if (task !== socketTask) {
        return
      }
      stopHeartbeat()
      socketTask = null
      if (!manualClose) {
        sessionStore.setRoomStatus('reconnecting', '房间连接已断开，正在重连')
        emit('status', sessionStore.getState())
        scheduleReconnect()
      }
    })

    task.onError(() => {
      if (task !== socketTask) {
        return
      }
      rejectOnce(new Error('房间连接异常'))
    })

    function rejectOnce(error) {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }
  })
}

function handleServerMessage(payload) {
  if (payload.type === 'room_created' || payload.type === 'room_joined') {
    sessionStore.applyRoomSnapshot(payload.state, payload.memberId, 'connected')
    emit('snapshot', sessionStore.getState())
    return
  }

  if (payload.type === 'room_snapshot') {
    sessionStore.applyRoomSnapshot(payload.state, '', 'connected')
    emit('snapshot', sessionStore.getState())
    return
  }

  if (payload.type === 'cart_updated') {
    sessionStore.applyRoomCartUpdate(payload)
    emit('cart', sessionStore.getState())
    return
  }

  if (payload.type === 'member_joined') {
    emit('member', payload)
    return
  }

  if (payload.type === 'room_error') {
    const error = new Error(payload.message || '房间同步失败')
    sessionStore.setRoomStatus('error', error.message)
    emit('error', error)
  }
}

function adjustItemQuantity(itemId, delta) {
  const session = sessionStore.getState()
  if (!session.room.roomId || session.room.status !== 'connected') {
    return Promise.reject(new Error('房间未连接，暂时不能修改点餐'))
  }

  return sendRaw({
    type: 'adjust_item_quantity',
    requestId: createRequestId('room_item'),
    itemId,
    delta,
  })
}

function sendRaw(payload) {
  return new Promise((resolve, reject) => {
    if (!socketTask) {
      reject(new Error('房间未连接'))
      return
    }

    socketTask.send({
      data: JSON.stringify(payload),
      success: resolve,
      fail: () => reject(new Error('房间消息发送失败')),
    })
  })
}

function closeSocket(clearRoom) {
  manualClose = true
  clearReconnectTimer()
  stopHeartbeat()

  if (socketTask) {
    socketTask.close({})
    socketTask = null
  }

  if (clearRoom) {
    sessionStore.clearRoom()
    emit('status', sessionStore.getState())
  }
}

function scheduleReconnect() {
  clearReconnectTimer()
  if (!activeRequest) {
    return
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    const session = sessionStore.getState()
    const roomId = session.room.roomId || activeRequest.roomId

    if (!roomId) {
      return
    }

    connectJoinRoom(roomId).catch((error) => {
      sessionStore.setRoomStatus('error', error.message || '房间重连失败')
      emit('error', error)
    })
  }, RECONNECT_DELAY_MS)
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (!socketTask) {
      return
    }

    sendRaw({
      type: 'heartbeat',
      requestId: createRequestId('room_ping'),
    }).catch(() => {})
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function buildSocketUrl(roomId) {
  const rooms = env.rooms || {}
  const country = settingsStore.getState().clientCountry
  let socketUrl = ''

  if (country === 'CN' || country === 'RU') {
    socketUrl = rooms.cnSocketUrl || rooms.socketUrl
  } else {
    socketUrl = rooms.cloudflareSocketUrl || deriveSocketUrlFromApi(env.cloudflare && env.cloudflare.apiUrl) || rooms.socketUrl
  }

  if (!socketUrl) {
    throw new Error('房间服务未配置')
  }

  if (!roomId) {
    return socketUrl
  }

  const separator = socketUrl.indexOf('?') === -1 ? '?' : '&'
  return `${socketUrl}${separator}roomId=${encodeURIComponent(roomId)}`
}

function deriveSocketUrlFromApi(apiUrl) {
  const value = String(apiUrl || '')
  const match = value.match(/^(https?):\/\/([^/]+)/)
  if (!match) {
    return ''
  }

  return `${match[1] === 'https' ? 'wss' : 'ws'}://${match[2]}/ws/rooms`
}

function loginWithWeChat() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('微信登录失败，未获取到 code'))
          return
        }
        resolve(res.code)
      },
      fail: () => reject(new Error('微信登录失败，请稍后重试')),
    })
  })
}

function getMemberProfile() {
  const saved = wx.getStorageSync(PROFILE_STORAGE_KEY)
  if (saved && saved.avatarColor) {
    return Promise.resolve(saved)
  }

  const profile = buildAnonymousProfile()
  wx.setStorageSync(PROFILE_STORAGE_KEY, profile)
  return Promise.resolve(profile)
}

function buildAnonymousProfile() {
  const seed = `${Date.now()}_${Math.floor(Math.random() * 100000)}`
  const colorIndex = Math.abs(hashNumber(seed)) % AVATAR_COLORS.length
  return {
    nickName: `成员${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    avatarUrl: '',
    avatarColor: AVATAR_COLORS[colorIndex],
  }
}

function createRequestId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
}

function hashNumber(value) {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

module.exports = {
  subscribe,
  connectCreateRoom,
  connectJoinRoom,
  prepareMemberProfile,
  adjustItemQuantity,
  closeSocket,
}
