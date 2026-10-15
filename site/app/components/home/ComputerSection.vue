<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// "Is my computer enough?" The visitor says what theirs is, and sees what the app would
// offer them: the same three models, by the same rule, as the app itself (offersFor in
// src/core/engine/models.ts). When a model or a threshold changes there, change it here.
//
// - What is offered: the models that fit. On a Mac, in its memory, shared with the chip that
//   runs the model. On a PC, in its memory and its graphics card's together: the model is
//   split between the two, most of it on the card.
// - What is recommended: on a Mac, the largest offered. On a PC, the graphics card is what
//   writes quickly: the largest offered that fits on the card itself (its VRAM), the
//   smallest when none does. The others run partly on the processor, slower.

const MODELS = [
  { name: 'Gemma 4 · Small', variant: 'E2B', blurb: 'Light and quick. Fine for a chat, weaker on long stories.', download: '4.6 GB', needs: 8, card: 6 },
  { name: 'Gemma 4 · Medium', variant: '12B', blurb: 'A good balance: stays in character and writes with care.', download: '8 GB', needs: 16, card: 8 },
  { name: 'Gemma 4 · Large', variant: '26B A4B', blurb: 'The best writing of the three, and the heaviest.', download: '18 GB', needs: 32, card: 16 },
]
const KINDS = [
  { value: 'pc', label: 'Windows or Linux PC' },
  { value: 'mac', label: 'Mac' },
] as const
const SIZES = [8, 16, 32]
/** The memory of the graphics card, in GB; 0: none. */
const CARDS = [0, 6, 8, 12, 16]

/** It starts on the most common gaming PC: 16 GB, and a graphics card of 8 GB. */
const kind = ref<'pc' | 'mac'>('pc')
const memory = ref(16)
const card = ref(8)

const rows = computed(() => {
  const total = memory.value + (kind.value === 'pc' ? card.value : 0)
  const fitting = MODELS.filter((model) => total >= model.needs)
  const onCard = (model: (typeof MODELS)[number]): boolean => kind.value === 'mac' || card.value >= model.card
  const recommended = kind.value === 'mac' ? fitting.at(-1) : (fitting.filter(onCard).at(-1) ?? fitting[0])
  return MODELS.map((model) => ({
    ...model,
    fits: fitting.includes(model),
    onCard: onCard(model),
    recommended: model === recommended,
  }))
})
</script>

<template>
  <section id="computer" class="computer" aria-labelledby="computer-title">
    <div class="wrap layout">
      <div class="words">
        <h2 id="computer-title">A model that fits your computer.</h2>
        <p class="lead">
          <template v-if="kind === 'mac'">
            On a Mac, the chip that writes shares the computer's memory: SillySimple offers the models that fit in it,
            and recommends the largest.
          </template>
          <template v-else>
            On a PC, the graphics card is what writes quickly: SillySimple recommends the largest model that fits on
            it. The computer's memory and the card's, together, decide which ones can run at all.
          </template>
        </p>
        <fieldset class="sizes">
          <legend>What is your computer?</legend>
          <label v-for="item in KINDS" :key="item.value" class="size" :class="{ picked: kind === item.value }">
            <input v-model="kind" class="sr-only" type="radio" name="kind" :value="item.value" />
            {{ item.label }}
          </label>
        </fieldset>
        <fieldset class="sizes">
          <legend>How much memory does it have?</legend>
          <label v-for="size in SIZES" :key="size" class="size" :class="{ picked: memory === size }">
            <input v-model="memory" class="sr-only" type="radio" name="memory" :value="size" />
            {{ size }} GB<template v-if="size === 32"> or more</template>
          </label>
        </fieldset>
        <fieldset v-if="kind === 'pc'" class="sizes">
          <legend>And its graphics card?</legend>
          <label v-for="size in CARDS" :key="size" class="size" :class="{ picked: card === size }">
            <input v-model="card" class="sr-only" type="radio" name="card" :value="size" />
            <template v-if="size === 0">None</template>
            <template v-else>{{ size }} GB<template v-if="size === 16"> or more</template></template>
          </label>
        </fieldset>
        <p v-if="kind === 'pc' && card === 0" class="speed">
          Without a graphics card, nothing is promised: the model runs on the processor alone, and replies can be very
          slow. There, an online service can write the replies, with a key of your own.
        </p>
        <p v-else-if="kind === 'mac'" class="speed">A Mac with an Apple chip: on an older Mac with an Intel processor, nothing is promised.</p>
        <NuxtLink class="more" to="/help/#graphics-card">Do I need a graphics card?<ArrowRight :size="18" :stroke-width="2.4" aria-hidden="true" /></NuxtLink>
      </div>

      <!-- Said out loud when another answer is picked. -->
      <ul class="models" aria-live="polite" aria-label="What the app offers this computer">
        <li v-for="model in rows" :key="model.name" class="model" :class="{ fits: model.fits, recommended: model.recommended }">
          <div class="about">
            <!-- The exact model in brackets, as the app writes it. -->
            <h3>{{ model.name }} <span class="variant">({{ model.variant }})</span></h3>
            <p>{{ model.blurb }}</p>
          </div>
          <p class="state">
            <span v-if="model.recommended" class="tag">Recommended</span>
            <template v-else-if="model.fits && model.onCard">Offered too</template>
            <template v-else-if="model.fits">Offered, slower</template>
            <template v-else-if="kind === 'pc'">Needs {{ model.needs }} GB in all</template>
            <template v-else>Needs {{ model.needs }} GB</template>
            <span class="weight">
              <template v-if="model.fits && !model.onCard">Needs a {{ model.card }} GB card to be quick · </template>{{ model.download }} to download
            </span>
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
