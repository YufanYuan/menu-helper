function buildMenuRecognitionInstruction(userLanguageLabel) {
  return [
    'You are extracting a restaurant menu for a travel ordering mini program.',
    'Read every provided menu image carefully and return the full menu as structured data.',
    'The images belong to the same restaurant menu and may be different pages or sections.',
    'Merge all visible dishes into one deduplicated menu.',
    'If the same dish appears multiple times, keep one entry with the most complete name, description, and price.',
    `Translate dish names, visible descriptions, and category labels into ${userLanguageLabel}.`,
    'Use translatedCategory for the translated category label. Keep it short, natural, and suitable for UI tabs.',
    'Infer translatedCategory from the menu section title when possible.',
    'Keep originalName exactly as shown on the menu whenever possible.',
    'Only fill descriptionOriginal and descriptionTranslated when the menu image actually shows a dish description.',
    'If a dish has no visible description, return empty strings for descriptionOriginal and descriptionTranslated.',
    'Do not invent dishes, descriptions, prices, sizes, options, or categories that are not visible in the image.',
    'Prefer a three-letter ISO 4217 currency code whenever possible, such as USD, EUR, JPY, or CNY.',
    'priceValue must be numeric and should represent the underlying numeric price when readable.',
    'priceText must be localized for the target language and use the target language writing habit rather than copying the original menu text.',
    'priceText should contain only the localized number expression itself and must not include any currency name, code, symbol, or unit.',
    `For ${userLanguageLabel}, abbreviate large numbers naturally for that language.`,
    'Examples: in English, values above 1200 may be written like 1.2k; in Chinese, 23500 should be written like 2.35万.',
    'If the original menu shows a currency, drop it from priceText after localization. For example, write 5万 instead of 5万日元, and write 3k instead of 3kVND.',
    'For thousand-level values, keep a normal number without forcing abbreviation unless it is natural in the target language.',
    'If the price is unclear, keep a best-effort localized priceText based on visible text and use 0 for priceValue.',
    'Return exactly one JSON object that matches the schema.',
  ].join(' ')
}

function buildMenuRecognitionMessages({ images, userLanguageLabel }) {
  return [
    {
      role: 'system',
      content: 'Return only the structured menu JSON requested by the schema.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: buildMenuRecognitionInstruction(userLanguageLabel),
        },
        ...images.map((image) => ({
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.imageBase64}`,
          },
        })),
      ],
    },
  ]
}

function buildMenuRecognitionInput({ images, userLanguageLabel }) {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: buildMenuRecognitionInstruction(userLanguageLabel),
        },
        ...images.map((image) => ({
          type: 'input_image',
          image_url: `data:${image.mimeType};base64,${image.imageBase64}`,
        })),
      ],
    },
  ]
}

function buildMenuRecognitionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['menuLanguage', 'currency', 'items'],
    properties: {
      menuLanguage: {
        type: 'string',
        description: 'The primary language used on the menu image, such as French, English, Chinese, or Japanese.',
      },
      currency: {
        type: 'string',
        description: 'Prefer a three-letter ISO 4217 code inferred from the menu, such as EUR, USD, JPY, or CNY. Return an empty string only if no currency can be inferred.',
      },
      items: {
        type: 'array',
        description: 'A flat list of all dishes or drinks visible in the menu image. Do not group items by category.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'translatedCategory',
            'originalName',
            'translatedName',
            'descriptionOriginal',
            'descriptionTranslated',
            'priceText',
            'priceValue',
          ],
          properties: {
            id: {
              type: 'string',
              description: 'A stable item identifier unique within this menu, such as dish_1, dish_2, or item_3.',
            },
            translatedCategory: {
              type: 'string',
              description: 'The category label translated into the target language for UI display. Keep it concise, such as Main, Drinks, Dessert, 主菜, 饮品, or 甜点.',
            },
            originalName: {
              type: 'string',
              description: 'The dish name exactly as it appears on the menu image. Preserve original spelling and language whenever possible.',
            },
            translatedName: {
              type: 'string',
              description: 'The dish name translated into the target language.',
            },
            descriptionOriginal: {
              type: 'string',
              description: 'The original dish description only if a description is visibly present on the menu. Otherwise return an empty string.',
            },
            descriptionTranslated: {
              type: 'string',
              description: 'The dish description translated into the target language only if a description is visibly present on the menu. Otherwise return an empty string.',
            },
            priceText: {
              type: 'string',
              description: 'The price rewritten for the target language. Use localized number reading habits, for example 1.2k in English or 2.35万 in Chinese when natural. Return only the localized numeric expression itself, without any currency name, currency code, symbol, or unit. Do not just copy the raw menu text unless that already matches the target language habit and still omits the currency marker.',
            },
            priceValue: {
              type: 'number',
              description: 'The numeric price value parsed from the menu when readable, without currency symbols or localized units. Use 0 only when unreadable.',
            },
          },
        },
      },
    },
  }
}

module.exports = {
  buildMenuRecognitionInput,
  buildMenuRecognitionMessages,
  buildMenuRecognitionSchema,
}
