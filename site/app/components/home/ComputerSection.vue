<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// "Is my computer enough?" The visitor says how much memory theirs has, and sees what the
// app would offer them: the same three models, by the same rule, as the app itself
// (src/core/engine/models.ts). When a model or its threshold changes there, change it here.
//
// Memory decides which model fits, not how fast it writes: the page says what a model needs
// to write at a pleasant speed, and promises nothing for a PC without a graphics card.

const MODELS = [
  { name: 'Gemma 4 · Small', variant: 'E2B', blurb: 'Light and quick. Fine for a chat, weaker on long stories.', download: '4.6 GB', needs: 8 },
  { name: 'Gemma 4 · Medium', variant: '12B', blurb: 'A good balance: stays in character and writes with care.', download: '8 GB', needs: 16 },
  { name: 'Gemma 4 · Large', variant: '26B A4B', blurb: 'The best writing of the three, and the heaviest.', download: '18 GB', needs: 32 },
]
const SIZES = [8, 16, 32]

/** The memory of the visitor's computer, in GB. It starts on the smallest: that is the point. */
const memory = ref(8)

/** Every model that fits is offered; the largest that fits is the one recommended. */
const rows = computed(() => {
  const fitting = MODELS.filter((model) => memory.value >= model.needs)
  return MODELS.map((model) => ({
    ...model,
    fits: fitting.includes(model),
    recommended: model === fitting.at(-1),
  }))
})
</script>

<template>
  <section id="computer" class="computer" aria-labelledby="computer-title">
    <div class="wrap layout">
      <div class="words">
        <h2 id="computer-title">A model that fits your computer.</h2>
        <p class="lead">
          SillySimple looks at how much memory yours has, and only offers the models that fit. With 8 GB, that is the
          small one.
        </p>
        <fieldset class="sizes">
          <legend>How much does your computer have?</legend>
          <label v-for="size in SIZES" :key="size" class="size" :class="{ picked: memory === size }">
            <input v-model="memory" class="sr-only" type="radio" name="memory" :value="size" />
            {{ size }} GB<template v-if="size === 32"> or more</template>
          </label>
        </fieldset>
        <p class="speed">
          To write at a pleasant speed, a model needs a Mac with an Apple chip, or a PC with a graphics card. On a PC
          without one, nothing is promised: there, an online service can write the replies, with a key of your own.
        </p>
        <NuxtLink class="more" to="/help/#graphics-card">Do I need a graphics card?<ArrowRight :size="18" :stroke-width="2.4" aria-hidden="true" /></NuxtLink>
      </div>

      <!-- Said out loud when another size is picked. -->
      <ul class="models" aria-live="polite" aria-label="What the app offers this computer">
        <li v-for="model in rows" :key="model.name" class="model" :class="{ fits: model.fits, recommended: model.recommended }">
          <div class="about">
            <!-- The exact model in brackets, as the app writes it. -->
            <h3>{{ model.name }} <span class="variant">({{ model.variant }})</span></h3>
            <p>{{ model.blurb }}</p>
          </div>
          <p class="state">
            <span v-if="model.recommended" class="tag">Recommended</span>
            <template v-else-if="model.fits">Offered too</template>
            <template v-else>Needs {{ model.needs }} GB</template>
            <span class="weight">{{ model.download }} to download</span>
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.computer {
  padding-block: var(--band);
  background: var(--page-1);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(32px, 6vw, 96px);
  align-items: center;
}
.words {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* --- The three sizes: one row of buttons, one of them picked ------------------------ */

.sizes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: var(--space-3);
  padding: 0;
  font-weight: 700;
}
.size {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 22px;
  border: 1px solid var(--field-line);
  border-radius: var(--radius-pill);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.size:hover,
.size.picked {
  background: var(--text);
  border-color: var(--text);
  color: var(--text-inverse);
}
.size:has(input:focus-visible) {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}

/* --- What memory does not say: how fast a model writes -------------------------------- */

.speed {
  max-width: 34em;
  margin-top: var(--space-3);
}
.more {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding-block: 8px;
  font-weight: 700;
  text-underline-offset: 5px;
}

/* --- What the app offers --------------------------------------------------------------- */

.models {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: 20px 24px;
  background: var(--panel-bg);
  /* A model the computer cannot run steps back, behind a dashed edge; one that fits steps
     forward. It stays readable: what it needs is written on it. */
  border: 2px dashed var(--field-line);
  border-radius: var(--radius-xl);
  opacity: 0.7;
  scale: 0.96;
  transition:
    opacity 0.3s ease-out,
    scale 0.35s cubic-bezier(0.3, 1.5, 0.5, 1),
    border-color 0.3s;
}
.model.fits {
  border-style: solid;
  border-color: transparent;
  opacity: 1;
  scale: 1;
}
.model.recommended {
  border-color: var(--orange);
}

.about {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
h3 {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.variant {
  color: var(--panel-soft);
  font-weight: 400;
  letter-spacing: 0;
}
.about p {
  color: var(--panel-soft);
}

.state {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-weight: 700;
  text-align: right;
}
.tag {
  padding: 3px 12px;
  background: var(--orange);
  color: var(--ink);
  border-radius: var(--radius-pill);
}
.weight {
  color: var(--panel-soft);
  font-size: var(--text-small);
  font-weight: 400;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .model {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .state {
    flex-direction: row;
    align-items: center;
    gap: var(--space-3);
    text-align: left;
  }
}
</style>
