Component({
  properties: {
    totalCount: {
      type: Number,
      value: 0,
    },
    totalPriceLabel: {
      type: String,
      value: '',
    },
    disabled: {
      type: Boolean,
      value: true,
    },
    actionText: {
      type: String,
      value: '查看已选',
    },
  },

  methods: {
    handleTap() {
      if (this.properties.disabled) {
        return
      }

      this.triggerEvent('preview')
    },
  },
})
