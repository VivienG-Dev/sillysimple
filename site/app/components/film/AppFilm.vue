<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'

// A film of the real app. It was filmed by driving the app itself (scripts/film, see
// README.md): nothing in it is drawn, apart from the pointer. Which film, and when each of
// its parts starts, comes from utils/films.ts.
//
// It plays by itself, without sound, once most of it is on screen, so that nobody misses its
// beginning, and not at all for people who asked their system for less motion: they get its
// picture and a play button (composables/useFilmPlayback.ts). The steps under it follow the
// film, and a click on one goes to that moment.

const props = defineProps<{ film: Film }>()
/** Which part of the film is being shown, for whoever tells about it beside the film. */
const emit = defineEmits<{ step: [index: number] }>()

const video = ref<HTMLVideoElement | null>(null)
const { playing, current, toggle, goTo, onPlay, onPause, onTime } = useFilmPlayback(video, () => props.film.steps)

watch(current, (index) => emit('step', index), { immediate: true })
defineExpose({ goTo })
</script>

<template>
  <figure class="film">
    <div class="screen">
      <video
        ref="video"
        muted
        loop
        playsinline
        preload="metadata"
        :poster="`/film/${film.name}-poster.webp`"
        width="1680"
        height="1052"
        :aria-label="film.shows"
        @play="onPlay"
        @pause="onPause"
        @timeupdate="onTime"
      >
        <source :src="`/film/${film.name}.webm`" type="video/webm" />
        <source :src="`/film/${film.name}.mp4`" type="video/mp4" />
      </video>
    </div>

    <figcaption class="caption">
      <div class="under">
        <button class="toggle" type="button" :aria-label="playing ? 'Pause the film' : 'Play the film'" @click="toggle">
          <Pause v-if="playing" :size="18" :stroke-width="2.4" aria-hidden="true" />
          <Play v-else :size="18" :stroke-width="2.4" aria-hidden="true" />
        </button>
        <ol class="steps" aria-label="What the film shows">
          <li v-for="(step, index) in film.steps" :key="step.label">
            <button type="button" class="step" :class="{ current: index === current }" :aria-current="index === current ? 'step' : undefined" @click="goTo(step.at)">
              <span class="number">{{ index + 1 }}</span>{{ step.label }}
            </button>
          </li>
        </ol>
      </div>
      <p v-if="film.note" class="note">{{ film.note }}</p>
    </figcaption>
  </figure>
</template>

<style scoped>
.film {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* The window of the app, resting on the page. */
.screen {
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: #1b1a22;
  box-shadow:
    0 0 0 1px var(--frame-line),
    0 44px 70px -28px rgb(var(--shade) / 0.7);
}
video {
  display: block;
  width: 100%;
  height: auto;
}

.under {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.toggle {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--action-bg);
  color: var(--action-text);
  border: 0;
  border-radius: 50%;
}
.toggle:hover {
  background: var(--action-hover);
}

.caption {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
/* What the film does not show as it happens. */
.note {
  color: var(--panel-soft);
  font-size: var(--text-small);
}

/* The steps of the film: the one being shown is filled in. */
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
}
/* On a phone they stay on one line, to slide along. */
@media (max-width: 720px) {
  .under {
    margin-right: calc(-1 * var(--gutter));
  }
  .steps {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-right: var(--gutter);
    scrollbar-width: none;
  }
  .step {
    white-space: nowrap;
  }
}
.step {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 18px 0 8px;
  background: transparent;
  /* A quiet edge: the step being shown is the one that stands out. */
  border: 1px solid var(--field-line);
  border-radius: var(--radius-pill);
  font-weight: 700;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--text);
  color: var(--text-inverse);
  border-radius: 50%;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
.step:hover,
.step.current {
  background: var(--text);
  border-color: var(--text);
  color: var(--text-inverse);
}
.step:hover .number,
.step.current .number {
  background: var(--text-inverse);
  color: var(--text);
}
</style>
