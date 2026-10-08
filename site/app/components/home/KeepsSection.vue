<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// What the app keeps track of in a story, without being asked: where the scene is, the
// memory of a long chat, where the story is heading, and what the user enjoys.
// The first two are on from the start; the last two are in beta and off until turned on,
// and the page says so, as the app does.
//
// Under each, the note the app really took, in a real chat (utils/notes.ts): the labels
// are the ones of the app's Memory tab. Until those notes exist, the four stand without.

const notes = storyNotes
const places = notes ? withoutRewordings(notes.places) : []

// Two things the app does are left out of the page for now, after the chat of 7 October
// 2026 with the small model (the one notes.json comes from, see .film/notes/log.json):
//
// - The clothes. They did not change by themselves, but a scarf put on in the story was
//   not added to the note. The page promised "until the story changes them": not yet.
// - The tags of the tastes. Two of five were right ("quiet moments", "rushed pace"); the
//   three others came from the character's own words, not from what the user wrote.
//
// Both are still in notes.json. Each comes back with one word here once it holds up.
const showClothes = false
const showTastes = false

const section = ref<HTMLElement | null>(null)
const unseen = useSeen(section, 0.3)

/** A long note is shown by its beginning: the rest is in the app. */
function beginning(text: string, most = 300): string {
  if (text.length <= most) return text
  const cut = text.slice(0, most)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), most - 40))}…`
}
</script>

<template>
  <section id="keeps" ref="section" class="keeps" :class="{ unseen }" aria-labelledby="keeps-title">
    <div class="wrap">
      <div class="head">
        <h2 id="keeps-title">It keeps the story straight.</h2>
        <p class="lead">
          A model forgets where it is, and what was said an hour ago. SillySimple takes notes for it, and every note is
          yours to read and correct. No extension to find or set up: it is all part of the app.
        </p>
      </div>

      <ul class="cards">
        <li class="card" style="--i: 0">
          <p class="state on">On from the start</p>
          <h3>The scene stays where it is</h3>
          <p v-if="showClothes">
            The character stays in the place until you go somewhere else, and keeps the same clothes until the story
            changes them. No kitchen that turns into a living room between two replies.
          </p>
          <p v-else>
            The character stays in the place until you go somewhere else. No kitchen that turns into a living room
            between two replies.
          </p>
          <dl v-if="notes && places.length" class="noted">
            <div>
              <dt>Where the scene is</dt>
              <dd class="trail">
                <span v-for="(place, index) in places" :key="place" :class="{ past: index < places.length - 1 }">
                  <ArrowRight v-if="index > 0" :size="16" :stroke-width="2.4" aria-label="then" />{{ place }}
                </span>
              </dd>
            </div>
            <div v-if="showClothes && notes.outfits.length">
              <dt>What {{ notes.character }} is wearing</dt>
              <dd class="trail">
                <span v-for="(outfit, index) in notes.outfits" :key="outfit" :class="{ past: index < notes.outfits.length - 1 }">
                  <ArrowRight v-if="index > 0" :size="16" :stroke-width="2.4" aria-label="then" />{{ outfit }}
                </span>
              </dd>
            </div>
          </dl>
        </li>

        <li class="card" style="--i: 1">
          <p class="state on">On from the start</p>
          <h3>Long chats are not forgotten</h3>
          <p>
            When a chat grows longer than the model can read at once, its oldest messages are summed up instead of
            being dropped. The character keeps the thread.
          </p>
          <dl v-if="notes?.memory" class="noted">
            <div>
              <dt>What is remembered of the first {{ notes.memory.covers }} messages</dt>
              <dd>{{ beginning(notes.memory.text) }}</dd>
            </div>
          </dl>
        </li>

        <li class="card" style="--i: 2">
          <p class="state">Beta · off until you turn it on</p>
          <h3>It follows where the story is heading</h3>
          <p>
            Two or three sentences on where this chat seems to be going. The character reads them, so the story keeps
            its direction.
          </p>
          <dl v-if="notes?.heading" class="noted">
            <div>
              <dt>Where this story seems to be heading</dt>
              <dd>{{ beginning(notes.heading) }}</dd>
            </div>
          </dl>
        </li>

        <li class="card" style="--i: 3">
          <p class="state">Beta · off until you turn it on</p>
          <h3>It learns how you like to play</h3>
          <p>
            Short tags about tone, pace and kinds of scenes, never about you as a person. Every character is told about
            them. Take one out and it is not proposed again.
          </p>
          <dl v-if="showTastes && notes && (notes.likes.length || notes.dislikes.length)" class="noted">
            <div v-if="notes.likes.length">
              <dt>You enjoy</dt>
              <dd class="tags">
                <span v-for="tag in notes.likes" :key="tag">{{ tag }}</span>
              </dd>
            </div>
            <div v-if="notes.dislikes.length">
              <dt>You do not enjoy</dt>
              <dd class="tags">
                <span v-for="tag in notes.dislikes" :key="tag">{{ tag }}</span>
              </dd>
            </div>
          </dl>
        </li>
      </ul>

      <p v-if="notes" class="source">
        The notes in the darker boxes were taken by the app itself, during a chat of {{ notes.messages }} messages with
        {{ notes.model }}. Nothing in them was written by hand.
      </p>
    </div>
  </section>
</template>

<style scoped>
.keeps {
  padding-block: var(--band);
  background: var(--page-3);
}

.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  margin-bottom: var(--space-7);
}
.lead {
  max-width: 38em;
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
}
.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: clamp(22px, 3vw, 32px);
  background: var(--panel-bg);
  color: var(--panel-text);
  border-radius: var(--radius-bubble);
  /* Its arrival, each card a little after the one before. */
  transition:
    opacity 0.4s ease-out calc(var(--i) * 70ms),
    translate 0.5s cubic-bezier(0.3, 1.3, 0.5, 1) calc(var(--i) * 70ms);
}
.unseen .card {
  opacity: 0;
  translate: 0 20px;
}

/* On from the start, or in beta: said before the name, as the app says it. */
.state {
  padding: 2px 12px;
  border: 1px solid var(--field-line);
  border-radius: var(--radius-pill);
  color: var(--panel-soft);
  font-size: var(--text-small);
  font-weight: 700;
}
.state.on {
  background: var(--cream);
  border-color: var(--cream);
  color: var(--ink);
}

h3 {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.card > p:not(.state) {
  color: var(--panel-soft);
}

/* What the app noted: darker, and in the type of the stories. */
.noted {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  /* At the foot of the card, whatever the length of the text above. */
  margin: auto 0 0;
  padding: 16px 18px;
  background: var(--page-5);
  border-radius: var(--radius-xl);
}
.noted > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card > p:not(.state) + .noted {
  margin-top: var(--space-3);
}
dt {
  color: var(--panel-soft);
  font-size: var(--text-small);
  font-weight: 700;
}
dd {
  margin: 0;
  font-family: var(--font-prose);
  line-height: 1.5;
}
/* A note that changed: what it was, then what it is, one under the other. */
.trail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.trail span {
  display: flex;
  gap: 8px;
}
.trail svg {
  flex-shrink: 0;
  /* On the first line of what follows it. */
  margin-top: 0.3em;
  color: var(--panel-soft);
}
.past {
  color: var(--panel-soft);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-family: var(--font-ui);
}
.tags span {
  padding: 2px 12px;
  border: 1px solid var(--field-line);
  border-radius: var(--radius-pill);
  font-size: var(--text-small);
  font-weight: 700;
}

.source {
  margin-top: var(--space-5);
  max-width: 46em;
  color: var(--panel-soft);
  font-size: var(--text-small);
}

@media (max-width: 820px) {
  .cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
