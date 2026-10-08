<script setup lang="ts" generic="T extends string">
import { motion } from 'motion-v'

// A row of tabs with a highlight that slides to the selected one.
// `layout-id` is what makes Motion animate the highlight between two buttons.

defineProps<{ options: { value: T; label: string }[]; label: string }>()
const selected = defineModel<T>({ required: true })

const groupId = useId()
</script>

<template>
  <div class="segmented" role="tablist" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="segment"
      :class="{ selected: option.value === selected }"
      :aria-selected="option.value === selected"
      @click="selected = option.value"
    >
      <motion.span
        v-if="option.value === selected"
        class="highlight"
        :layout-id="`segment-${groupId}`"
        :transition="{ type: 'spring', stiffness: 500, damping: 40 }"
      />
      <span class="text">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--bg-field);
  border-radius: var(--radius);
}

.segment {
  position: relative;
  flex: 1;
  height: 26px;
  padding: 0 14px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.segment.selected {
  color: var(--text);
}

.highlight {
  position: absolute;
  inset: 0;
  background: var(--bg-selected);
  border-radius: var(--radius-sm);
}

.text {
  position: relative;
}
</style>
