function cloneCart(cart) {
  return Object.assign({}, cart || {})
}

function setItemQuantity(cart, itemId, quantity) {
  const nextCart = cloneCart(cart)
  const safeQuantity = Math.max(0, Number(quantity) || 0)

  if (safeQuantity === 0) {
    delete nextCart[itemId]
    return nextCart
  }

  nextCart[itemId] = safeQuantity
  return nextCart
}

function buildCartItems(items, cart) {
  return items
    .filter((item) => cart[item.id])
    .map((item) => ({
      ...item,
      quantity: cart[item.id],
      subtotal: (cart[item.id] || 0) * (item.priceValue || 0),
    }))
}

function getCartSummary(items, cart) {
  const cartItems = buildCartItems(items, cart)

  return cartItems.reduce(
    (summary, item) => ({
      totalCount: summary.totalCount + item.quantity,
      totalPrice: summary.totalPrice + item.subtotal,
      cartItems,
    }),
    {
      totalCount: 0,
      totalPrice: 0,
      cartItems,
    }
  )
}

module.exports = {
  setItemQuantity,
  buildCartItems,
  getCartSummary,
}
