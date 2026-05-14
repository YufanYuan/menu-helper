const env = require('../config/env')
const {
  requestStructuredChatCompletion,
} = require('./llm-client')
const {
  buildMenuRecognitionInput,
  buildMenuRecognitionMessages,
  buildMenuRecognitionSchema,
} = require('../utils/prompts')
const { normalizeMenuPayload } = require('../domain/menu')

function getMockMenu(userLanguage) {
  const copy = getLanguageCopy(userLanguage)

  return {
    menuLanguage: 'French',
    currency: 'EUR',
    items: [
      {
        id: 'dish_1',
        translatedCategory: copy.categories.main,
        originalName: 'Pates aux fruits de mer',
        translatedName: copy.seafoodPasta,
        descriptionOriginal: 'Crevettes, moules, sauce tomate epicee',
        descriptionTranslated: copy.seafoodPastaDesc,
        priceText: '18.50',
        priceValue: 18.5,
        initialQuantity: 2,
      },
      {
        id: 'dish_2',
        translatedCategory: copy.categories.starter,
        originalName: 'Veloute de potiron',
        translatedName: copy.pumpkinSoup,
        descriptionOriginal: 'Soupe cremeuse a la courge',
        descriptionTranslated: copy.pumpkinSoupDesc,
        priceText: '7.00',
        priceValue: 7,
        initialQuantity: 1,
      },
      {
        id: 'dish_3',
        translatedCategory: copy.categories.dessert,
        originalName: 'Creme brulee',
        translatedName: copy.cremeBrulee,
        descriptionOriginal: 'Vanille, caramel croustillant',
        descriptionTranslated: copy.cremeBruleeDesc,
        priceText: '6.50',
        priceValue: 6.5,
      },
      {
        id: 'dish_4',
        translatedCategory: copy.categories.main,
        originalName: 'Boeuf bourguignon',
        translatedName: copy.beefStew,
        descriptionOriginal: 'Boeuf mijote au vin rouge, carottes',
        descriptionTranslated: copy.beefStewDesc,
        priceText: '19.00',
        priceValue: 19,
      },
      {
        id: 'dish_5',
        translatedCategory: copy.categories.main,
        originalName: 'Poulet roti citron',
        translatedName: copy.lemonChicken,
        descriptionOriginal: 'Poulet roti, jus de citron, herbes',
        descriptionTranslated: copy.lemonChickenDesc,
        priceText: '16.00',
        priceValue: 16,
      },
      {
        id: 'dish_6',
        translatedCategory: copy.categories.starter,
        originalName: 'Salade de chevre chaud',
        translatedName: copy.goatCheeseSalad,
        descriptionOriginal: 'Salade verte, fromage de chevre, noix',
        descriptionTranslated: copy.goatCheeseSaladDesc,
        priceText: '8.50',
        priceValue: 8.5,
      },
      {
        id: 'dish_7',
        translatedCategory: copy.categories.starter,
        originalName: 'Soupe a l oignon',
        translatedName: copy.onionSoup,
        descriptionOriginal: 'Soupe d oignons gratinee au fromage',
        descriptionTranslated: copy.onionSoupDesc,
        priceText: '7.80',
        priceValue: 7.8,
      },
      {
        id: 'dish_8',
        translatedCategory: copy.categories.dessert,
        originalName: 'Tarte au citron',
        translatedName: copy.lemonTart,
        descriptionOriginal: 'Creme citron, pate sablee',
        descriptionTranslated: copy.lemonTartDesc,
        priceText: '6.80',
        priceValue: 6.8,
        initialQuantity: 1,
      },
      {
        id: 'dish_9',
        translatedCategory: copy.categories.drinks,
        originalName: 'Citronnade maison',
        translatedName: copy.lemonade,
        descriptionOriginal: 'Boisson citronnee maison',
        descriptionTranslated: copy.lemonadeDesc,
        priceText: '4.50',
        priceValue: 4.5,
      },
      {
        id: 'dish_10',
        translatedCategory: copy.categories.drinks,
        originalName: 'Cafe allonge',
        translatedName: copy.coffee,
        descriptionOriginal: 'Cafe legerement allonge',
        descriptionTranslated: copy.coffeeDesc,
        priceText: '3.20',
        priceValue: 3.2,
      },
      {
        id: 'dish_11',
        translatedCategory: copy.categories.special,
        originalName: 'Plateau degustation',
        translatedName: copy.tastingPlate,
        descriptionOriginal: 'Selection de trois specialites de la maison',
        descriptionTranslated: copy.tastingPlateDesc,
        priceText: '22.00',
        priceValue: 22,
      },
      {
        id: 'dish_12',
        translatedCategory: copy.categories.special,
        originalName: 'Menu enfant',
        translatedName: copy.kidsMenu,
        descriptionOriginal: 'Petit plat, boisson, dessert',
        descriptionTranslated: copy.kidsMenuDesc,
        priceText: '11.00',
        priceValue: 11,
      },
    ],
  }
}

function getLanguageCopy(userLanguage) {
  if (userLanguage === 'English') {
    return {
      categories: {
        main: 'Main',
        starter: 'Starter',
        dessert: 'Dessert',
        drinks: 'Drinks',
        special: 'Special',
      },
      seafoodPasta: 'Seafood pasta',
      seafoodPastaDesc: 'Shrimp, mussels, spicy tomato sauce',
      pumpkinSoup: 'Pumpkin soup',
      pumpkinSoupDesc: 'Creamy pumpkin soup',
      cremeBrulee: 'Creme brulee',
      cremeBruleeDesc: 'Vanilla custard with caramel crust',
      beefStew: 'Red wine beef stew',
      beefStewDesc: 'Slow-cooked beef with red wine and carrots',
      lemonChicken: 'Roast chicken with lemon',
      lemonChickenDesc: 'Roasted chicken with lemon jus and herbs',
      goatCheeseSalad: 'Warm goat cheese salad',
      goatCheeseSaladDesc: 'Green salad with goat cheese and walnuts',
      onionSoup: 'French onion soup',
      onionSoupDesc: 'Onion soup finished with melted cheese',
      lemonTart: 'Lemon tart',
      lemonTartDesc: 'Lemon cream tart with shortcrust pastry',
      lemonade: 'House lemonade',
      lemonadeDesc: 'Fresh homemade lemonade',
      coffee: 'Long black coffee',
      coffeeDesc: 'Lightly diluted coffee',
      tastingPlate: 'Chef tasting plate',
      tastingPlateDesc: 'A sampler of three house specialties',
      kidsMenu: 'Kids menu',
      kidsMenuDesc: 'Main, drink, and dessert for children',
    }
  }

  return {
    categories: {
      main: '主菜',
      starter: '前菜',
      dessert: '甜点',
      drinks: '饮品',
      special: '特色',
    },
    seafoodPasta: '海鲜意面',
    seafoodPastaDesc: '虾、青口、微辣番茄酱',
    pumpkinSoup: '南瓜浓汤',
    pumpkinSoupDesc: '奶油南瓜汤',
    cremeBrulee: '焦糖布蕾',
    cremeBruleeDesc: '香草布丁配脆糖壳',
    beefStew: '红酒炖牛肉',
    beefStewDesc: '红酒慢炖牛肉，配胡萝卜',
    lemonChicken: '香草柠檬烤鸡',
    lemonChickenDesc: '烤鸡配柠檬汁和香草',
    goatCheeseSalad: '热山羊奶酪沙拉',
    goatCheeseSaladDesc: '生菜、山羊奶酪和核桃',
    onionSoup: '法式洋葱汤',
    onionSoupDesc: '焗芝士洋葱浓汤',
    lemonTart: '柠檬挞',
    lemonTartDesc: '柠檬奶油馅配酥皮',
    lemonade: '自制柠檬水',
    lemonadeDesc: '新鲜现做柠檬饮',
    coffee: '美式咖啡',
    coffeeDesc: '加水延展的淡咖啡',
    tastingPlate: '主厨尝味拼盘',
    tastingPlateDesc: '三款招牌菜组合',
    kidsMenu: '儿童套餐',
    kidsMenuDesc: '主菜、饮料和甜点组合',
  }
}

async function recognizeMenu({
  images,
  imageBase64,
  mimeType,
  userLanguage,
  clientRequestId,
  sessionId,
}) {
  if (env.useMockLLM) {
    return normalizeMenuPayload(getMockMenu(userLanguage))
  }

  const schema = buildMenuRecognitionSchema()
  const payload = await requestMenuExtraction({
    images: normalizeRecognitionImages({ images, imageBase64, mimeType }),
    userLanguage,
    schema,
    clientRequestId,
    sessionId,
  })

  return normalizeMenuPayload(payload)
}

async function requestMenuExtraction({ images, userLanguage, schema, clientRequestId, sessionId }) {
  const messages = buildMenuRecognitionMessages({
    images,
    userLanguageLabel: userLanguage,
  })
  const volcInput = buildMenuRecognitionInput({
    images,
    userLanguageLabel: userLanguage,
  })

  return requestStructuredChatCompletion({
    messages,
    schema,
    schemaName: 'menu_extraction',
    volcInput,
    clientRequestId,
    sessionId,
  })
}

function normalizeRecognitionImages({ images, imageBase64, mimeType }) {
  if (Array.isArray(images) && images.length) {
    return images
      .filter((image) => image && image.imageBase64 && image.mimeType)
      .map((image) => ({
        imageBase64: image.imageBase64,
        mimeType: image.mimeType,
      }))
  }

  if (imageBase64 && mimeType) {
    return [{
      imageBase64,
      mimeType,
    }]
  }

  throw new Error('缺少菜单图片')
}

module.exports = {
  recognizeMenu,
}
