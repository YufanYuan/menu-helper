const { formatCurrencyAmount, normalizeCurrencyCode } = require('../utils/currency')

const ALL_CATEGORY = '全部'

function normalizeCategory(value) {
  return value || '其他'
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePriceValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeMenuPayload(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : []

  return {
    menuLanguage: normalizeText(payload && payload.menuLanguage) || '未知',
    currency: normalizeCurrencyCode(payload && payload.currency),
    items: items
      .map((item, index) => ({
        id: normalizeText(item.id) || `item_${index + 1}`,
        translatedCategory: normalizeCategory(
          normalizeText(item.translatedCategory) || normalizeText(item.category),
        ),
        originalName: normalizeText(item.originalName) || `菜品 ${index + 1}`,
        translatedName: normalizeText(item.translatedName),
        descriptionOriginal: normalizeText(item.descriptionOriginal),
        descriptionTranslated: normalizeText(item.descriptionTranslated),
        priceText: normalizeText(item.priceText),
        priceValue: normalizePriceValue(item.priceValue),
        initialQuantity: normalizePriceValue(item.initialQuantity),
      }))
      .filter((item) => item.originalName),
  }
}

function buildCategories(items) {
  const categories = [ALL_CATEGORY]
  items.forEach((item) => {
    if (!categories.includes(item.translatedCategory)) {
      categories.push(item.translatedCategory)
    }
  })
  return categories
}

function filterItemsByCategory(items, category) {
  if (!category || category === ALL_CATEGORY) {
    return items
  }
  return items.filter((item) => item.translatedCategory === category)
}

function formatPrice(item, currency) {
  if (item.priceText) {
    return item.priceText
  }
  if (!item.priceValue) {
    return '价格待确认'
  }
  return formatCurrencyAmount(item.priceValue, currency)
}

module.exports = {
  ALL_CATEGORY,
  normalizeMenuPayload,
  buildCategories,
  filterItemsByCategory,
  formatPrice,
}
