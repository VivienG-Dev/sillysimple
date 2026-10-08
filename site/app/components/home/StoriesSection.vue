<script setup lang="ts">
import stories from '~/data/stories.json'

// The stories that come with the app, as the app tells them: with the visitor's own name
// in them. The data is read from the app's own cards (pnpm stories, see scripts/stories.mjs).

type Story = (typeof stories)[number]

/** What the visitor typed. Until they do, the stories are told to "Robin". */
const typed = ref('')
const you = computed(() => typed.value.trim() || 'Robin')

const pickedId = ref(stories[0]!.id)
const story = computed<Story>(() => stories.find((item) => item.id === pickedId.value) ?? stories[0]!)

const tell = (text: string): string => applyMacros(text, { char: story.value.name, user: you.value })
const pitch = computed(() => tell(story.value.pitch))
const opening = computed(() => formatMessage(tell(story.value.opening)))

// The covers come onto the shelf one after the other, the first time it is seen.
const shelf = ref<HTMLElement | null>(null)
const unseen = useSeen(shelf)
</script>

<template>
  <section id="stories" class="stories" aria-labelledby="stories-title">
    <div class="wrap">
      <div class="head">
        <h2 id="stories-title">{{ stories.length }} stories come with it.</h2>
        <!-- The first question the app asks. Here it puts the visitor's name in the stories below. -->
        <label class="you">
          <span>What should characters call you?</span>
          <input v-model="typed" type="text" maxlength="40" placeholder="Robin" autocomplete="off" spellcheck="false" />
        </label>
      </div>

      <ul ref="shelf" class="shelf" :class="{ unseen }" aria-label="Stories">
        <li v-for="(item, index) in stories" :key="item.id" :style="{ '--i': index }">
          <button
            type="button"
            class="cover"
            :class="{ picked: item.id === story.id }"
            :aria-pressed="item.id === story.id"
            :style="item.picture ? undefined : { background: avatarColors(item.name).portraitBg, color: avatarColors(item.name).fg }"
            @click="pickedId = item.id"
          >
            <img v-if="item.picture" :src="item.picture" alt="" width="640" height="935" loading="lazy" />
            <span v-else class="initials" aria-hidden="true">{{ initials(item.name) }}</span>
            <span class="name">{{ item.name }}</span>
          </button>
        </li>
      </ul>

      <!-- Said out loud when another story is picked. -->
      <article class="bubble told" aria-live="polite">
        <Transition name="tell" mode="out-in">
          <div :key="story.id" class="inside">
            <div class="about">
              <h3>{{ story.name }}</h3>
              <p class="tagline">{{ story.tagline }}</p>
              <p class="pitch">{{ pitch }}</p>
              <ul class="tags" aria-label="Genres">
                <li v-for="tag in story.tags" :key="tag">{{ tag }}</li>
              </ul>
              <p class="ways">{{ story.openings }} ways to begin</p>
            </div>
            <!-- formatMessage() escapes the text before adding its own tags -->
            <div class="opening" v-html="opening" />
          </div>
        </Transition>
      </article>
    </div>
  </section>
</template>

<style scoped>
.stories {
  padding-block: var(--band);
  background: linear-gradient(to bottom, var(--page-2), var(--page-3));
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5) var(--space-7);
  margin-bottom: var(--space-7);
}

.you {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: 1.1875rem;
  font-weight: 700;
}
.you input {
  width: min(100%, 300px);
  height: 52px;
  padding: 0 20px;
  background: var(--field-bg);
  color: var(--field-text);
  border: 2px solid var(--field-line);
  border-radius: var(--radius-pill);
  font-family: var(--font-prose);
  font-size: 1.125rem;
  font-weight: 400;
}
.you input::placeholder {
  color: var(--field-hint);
}
.you input:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}

/* --- The shelf ------------------------------------------------------------------ */

.shelf {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: clamp(8px, 1.2vw, 16px);
  margin-bottom: var(--space-6);
}
.cover {
  position: relative;
  display: block;
  width: 100%;
  /* The shape of a card's picture in the app. */
  aspect-ratio: 2 / 3;
  padding: 0;
  overflow: hidden;
  /* What shows while a picture loads, and behind the name if it never does. */
  background: #15141b;
  /* An edge: without it a dark cover would melt into the dark page. */
  border: 1px solid var(--frame-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 14px 22px -12px rgb(var(--shade) / 0.8);
  /* The last two lines are its arrival on the shelf, each cover a little after the one before. */
  transition:
    transform 0.2s cubic-bezier(0.3, 1.5, 0.5, 1),
    box-shadow 0.2s,
    opacity 0.35s ease-out calc(var(--i) * 55ms),
    translate 0.45s cubic-bezier(0.3, 1.4, 0.5, 1) calc(var(--i) * 55ms);
}
.shelf.unseen .cover {
  opacity: 0;
  translate: 0 18px;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}
.initials {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 22%;
  font-family: var(--font-prose);
  font-size: clamp(1.4rem, 3vw, 2.4rem);
  font-weight: 400;
  opacity: 0.7;
}
.name {
  position: absolute;
  inset: auto 0 0;
  padding: 26px 8px 10px;
  /* Dark enough behind the name whatever the picture is. */
  background: linear-gradient(to top, rgb(21 20 27 / 0.94), rgb(21 20 27 / 0.82) 55%, rgb(21 20 27 / 0));
  color: #ecebf2;
  font-size: clamp(0.75rem, 1vw, 0.875rem);
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
.cover:hover {
  transform: translateY(-4px);
}
/* The one that is picked steps forward, with a cream edge. */
.cover.picked {
  transform: translateY(-10px);
  box-shadow:
    0 0 0 4px var(--cream),
    0 22px 26px -12px rgb(var(--shade) / 0.9);
}
.cover:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 5px;
}

/* --- The story that is picked ------------------------------------------------------ */

.told {
  background: var(--panel-bg);
  color: var(--panel-text);
  padding: clamp(24px, 4vw, 48px);
}
.inside {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(24px, 4vw, 56px);
}
/* Another story is picked: the old one leaves quickly, the new one comes up. */
.tell-leave-active {
  transition: opacity 0.1s ease-in;
}
.tell-enter-active {
  transition:
    opacity 0.22s ease-out,
    translate 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.tell-leave-to {
  opacity: 0;
}
.tell-enter-from {
  opacity: 0;
  translate: 0 8px;
}
.about {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}
h3 {
  font-size: clamp(1.6rem, 2.6vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.tagline {
  color: var(--panel-soft);
  font-weight: 700;
}
.pitch {
  margin-top: var(--space-2);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--space-2);
}
.tags li {
  padding: 3px 12px;
  border: 1.5px solid var(--panel-soft);
  border-radius: var(--radius-pill);
  font-size: var(--text-small);
  font-weight: 700;
}
.ways {
  color: var(--panel-soft);
  font-size: var(--text-small);
  font-weight: 700;
}

/* The story's first message, set as the app sets it: a serif, actions in italics. */
.opening {
  font-family: var(--font-prose);
  font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem);
  line-height: 1.7;
}
.opening :deep(p + p) {
  margin-top: 0.7em;
}
.opening :deep(em) {
  color: var(--panel-soft);
}

@media (max-width: 900px) {
  /* The shelf becomes a row to slide along. */
  .shelf {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: 124px;
    overflow-x: auto;
    margin-inline: calc(-1 * var(--gutter));
    padding: 14px var(--gutter) 22px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .shelf li {
    scroll-snap-align: center;
  }
  .inside {
    grid-template-columns: 1fr;
  }
}
</style>
