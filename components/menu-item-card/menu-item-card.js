Component({
  properties: {
    item: {
      type: Object,
      value: {},
    },
    quantity: {
      type: Number,
      value: 0,
    },
  },

  methods: {
    handleQuantityChange(event) {
      this.triggerEvent('quantitychange', {
        itemId: this.properties.item.id,
        value: event.detail.value,
      })
    },
  },
})
