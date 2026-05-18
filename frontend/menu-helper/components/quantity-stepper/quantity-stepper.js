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
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    handleMinus() {
      if (this.properties.disabled) {
        return
      }
      const nextValue = Math.max(this.properties.min, this.properties.value - 1)
      this.triggerEvent('change', { value: nextValue })
    },

    handlePlus() {
      if (this.properties.disabled) {
        return
      }
      const nextValue = this.properties.value + 1
      this.triggerEvent('change', { value: nextValue })
    },
  },
})
