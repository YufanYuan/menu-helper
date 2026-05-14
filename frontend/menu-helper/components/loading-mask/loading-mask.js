const MIN_PROGRESS = 0.06
const MAX_PROGRESS = 0.94
const DEFAULT_TARGET_SECONDS = 60
const DEFAULT_TARGET_PROGRESS = 0.8
const TICK_MS = 200

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

Component({
  data: {
    progressPercent: 0,
    progressText: '0%',
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this.startProgress()
          return
        }

        this.stopProgress()
        this.resetProgress()
      },
    },
    title: {
      type: String,
      value: '处理中',
    },
    subtitle: {
      type: String,
      value: '',
    },
    estimateSeconds: {
      type: Number,
      value: DEFAULT_TARGET_SECONDS,
    },
    targetProgress: {
      type: Number,
      value: DEFAULT_TARGET_PROGRESS,
    },
  },

  lifetimes: {
    detached() {
      this.stopProgress()
    },
  },

  methods: {
    resetProgress() {
      this.setData({
        progressPercent: 0,
        progressText: '0%',
      })
    },

    startProgress() {
      this.stopProgress()
      this.progressStartTime = Date.now()
      this.updateProgress()
      this.progressTimer = setInterval(() => {
        this.updateProgress()
      }, TICK_MS)
    },

    stopProgress() {
      if (this.progressTimer) {
        clearInterval(this.progressTimer)
        this.progressTimer = null
      }
    },

    updateProgress() {
      const elapsedSeconds = Math.max((Date.now() - this.progressStartTime) / 1000, 0)
      const estimateSeconds = Math.max(Number(this.properties.estimateSeconds) || DEFAULT_TARGET_SECONDS, 1)
      const requestedTarget = clamp(Number(this.properties.targetProgress) || DEFAULT_TARGET_PROGRESS, 0.1, 0.95)
      const normalizedTarget = clamp((requestedTarget - MIN_PROGRESS) / (MAX_PROGRESS - MIN_PROGRESS), 0.01, 0.99)
      const decayRate = -Math.log(1 - normalizedTarget) / estimateSeconds
      const normalizedProgress = 1 - Math.exp(-decayRate * elapsedSeconds)
      const progress = MIN_PROGRESS + (MAX_PROGRESS - MIN_PROGRESS) * normalizedProgress
      const progressPercent = clamp(Math.round(progress * 100), 0, Math.round(MAX_PROGRESS * 100))

      this.setData({
        progressPercent,
        progressText: `${progressPercent}%`,
      })
    },
  },
})
