<script setup lang="ts">
// A guide as it is watched: the icon above, saying what to do, and under it the film of
// the real app doing it. What the icon says follows the film: when another part starts,
// it changes subject.

const props = defineProps<{ guide: ReadyGuide }>()

const film = ref<{ goTo(at: number): void } | null>(null)
/** The part of the film being shown. */
const step = ref(0)
const told = computed(() => props.guide.steps[Math.max(0, step.value)] ?? props.guide.steps[0]!)

/** Shows a step: the film goes to its start. For the list of steps under the stage. */
function show(index: number): void {
  const at = props.guide.film.steps[index]?.at
  if (at !== undefined) film.value?.goTo(at)
}
defineExpose({ show })
</script>

<template>
  <div class="stage">
    <MascotGuide :title="`${Math.max(0, step) + 1}. ${told.title}`" :text="told.says" :size="76" :room="guide.steps.map((item) => item.says)" />
    <AppFilm ref="film" :film="guide.film" @step="step = $event" />
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
</style>
