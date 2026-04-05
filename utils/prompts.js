function buildMenuRecognitionInstruction(userLanguageLabel) {
  return [
    'You are extracting a restaurant menu for a travel ordering mini program.',
    'Read every provided menu image carefully and return the full menu as structured data.',
    'The images belong to the same restaurant menu and may be different pages or sections.',
    'Merge all visible dishes into one deduplicated menu.',
    'If the same dish appears multiple times, keep one entry with the most complete name, description, and price.',
    `Translate dish names and descriptions into ${userLanguageLabel}.`,
    `Translate category labels into ${userLanguageLabel} as well, and keep them short.`,
    'Keep the original dish name exactly as shown on the menu whenever possible.',
    'Infer category from the menu section title.',
    'If the price is unclear, keep priceText as the visible text and use 0 for priceValue.',
    'Do not invent dishes that are not in the image.',
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
