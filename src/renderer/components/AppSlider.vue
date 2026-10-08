<script setup lang="ts">
// A labelled slider. It shows the value while dragging and emits `commit`
// once on release, so settings are saved once and not on every pixel.

const props = defineProps<{
  label: string
  value: number
  min: number
  max: number
  step: number
  /** How to print the value, e.g. (v) => v.toFixed(2) */
  format?: (value: number) => string
}>()
const emit = defineEmits<{ commit: [value: number] }>()

const draft = ref(props.value)
watch(
  () => props.value,
  (value) => (draft.value = value),
)

const percent = computed(() => ((draft.value - props.min) / (props.max - props.min)) * 100)
const display = computed(() => (props.format ? props.format(draft.value) : String(draft.value)))
</script>

<template>
  <label class="slider">
    <span class="row">
      <span>{{ label }}</span>
      <span class="value">{{ display }}</span>
    </span>
    <input
      v-model.number="draft"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :style="{ '--percent': `${percent}%` }"
      @change="emit('commit', draft)"
    />
  </label>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.row {
  display: flex;
  justify-content: space-between;
}
.value {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

input[type='range'] {
  appearance: none;
  width: 100%;
  height: 14px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    var(--accent-strong) var(--percent),
    var(--border-field) var(--percent)
  );
}
input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--text);
}
</style>
