const env = require('./env')

const ABSOLUTE_MAX_MENU_IMAGE_COUNT = 9

function getMenuImageUploadLimit() {
  const rawLimit = Number(env.features && env.features.menuUploadMaxCount)

  if (!Number.isFinite(rawLimit)) {
    return 1
  }

  return Math.max(1, Math.min(ABSOLUTE_MAX_MENU_IMAGE_COUNT, Math.floor(rawLimit)))
}

function isMultiImageUploadEnabled() {
  return getMenuImageUploadLimit() > 1
}

function isExchangeRateReferenceEnabled() {
  return Boolean(env.features && env.features.exchangeRateReferenceEnabled)
}

module.exports = {
  ABSOLUTE_MAX_MENU_IMAGE_COUNT,
  getMenuImageUploadLimit,
  isMultiImageUploadEnabled,
  isExchangeRateReferenceEnabled,
}
