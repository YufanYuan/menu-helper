Component({
  properties: {
    value: {
      type: Number,
      value: 0,
    },
    min: {
      type: Number,
      value: 0,
    },
  },

  methods: {
    handleMinus() {
      const nextValue = Math.max(this.properties.min, this.properties.value - 1)
      this.triggerEvent('change', { value: nextValue })
    },

    handlePlus() {
      const nextValue = this.properties.value + 1
      this.triggerEvent('change', { value: nextValue })
    },
  },
})
