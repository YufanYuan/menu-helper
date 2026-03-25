function buildMenuRecognitionInstruction(userLanguageLabel) {
  return [
    'You are extracting a restaurant menu for a travel ordering mini program.',
    'Read the menu image carefully and return the full menu as structured data.',
    `Translate dish names and descriptions into ${userLanguageLabel}.`,
    `Translate category labels into ${userLanguageLabel} as well, and keep them short.`,
    'Keep the original dish name exactly as shown on the menu whenever possible.',
    'Infer category from the menu section title.',
    'If the price is unclear, keep priceText as the visible text and use 0 for priceValue.',
    'Do not invent dishes that are not in the image.',
  ].join(' ')
}

function buildMenuRecognitionMessages({ imageBase64, mimeType, userLanguageLabel }) {
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
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
          },
        },
      ],
    },
  ]
}

function buildMenuRecognitionInput({ imageBase64, mimeType, userLanguageLabel }) {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: `data:${mimeType};base64,${imageBase64}`,
        },
        {
          type: 'input_text',
          text: buildMenuRecognitionInstruction(userLanguageLabel),
        },
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
      },
      currency: {
        type: 'string',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'category',
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
            },
            category: {
              type: 'string',
            },
            originalName: {
              type: 'string',
            },
            translatedName: {
              type: 'string',
            },
            descriptionOriginal: {
              type: 'string',
            },
            descriptionTranslated: {
              type: 'string',
            },
            priceText: {
              type: 'string',
            },
            priceValue: {
              type: 'number',
            },
          },
        },
      },
    },
  }
}

module.exports = {
  buildMenuRecognitionMessages,
  buildMenuRecognitionInput,
  buildMenuRecognitionSchema,
}
