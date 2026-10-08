<script setup lang="ts">
import { Archive, Cloud, Folder, KeyRound, Lock, Volume2 } from '@lucide/vue'

// What stays on the visitor's computer and what leaves it, said as the app says it in
// Settings › Data & Privacy. Nothing is promised here that the app does not do.

const FACTS = [
  {
    icon: Folder,
    text: 'Your characters, chats and settings are files in one folder on your computer.',
  },
  {
    icon: Lock,
    text: 'With a model on your computer, your chats never leave it.',
  },
  {
    icon: Cloud,
    text: 'With an online service, the conversation and the character’s card are sent to that service to write each reply.',
  },
  {
    icon: Volume2,
    text: 'Reading replies aloud is off until you turn it on. With an online voice, the text of a reply is sent to that voice service when it is read.',
  },
  {
    icon: KeyRound,
    text: 'API keys are encrypted by your computer, and are never part of a backup.',
  },
  {
    icon: Archive,
    text: 'A backup is an ordinary .zip file you can open by hand. “Erase everything” puts the app back as it was on the first day.',
  },
]
</script>

<template>
  <section id="privacy" class="privacy" aria-labelledby="privacy-title">
    <div class="wrap layout">
      <h2 id="privacy-title">No account. No SillySimple server. Nothing is ever sent to us.</h2>
      <ul class="facts">
        <li v-for="fact in FACTS" :key="fact.text">
          <component :is="fact.icon" :size="22" :stroke-width="2" aria-hidden="true" />
          <p>{{ fact.text }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.privacy {
  padding-block: var(--band);
  background: linear-gradient(to bottom, var(--page-4), var(--page-5));
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: clamp(32px, 6vw, 96px);
  align-items: start;
}
h2 {
  line-height: 1.05;
}

.facts {
  display: flex;
  flex-direction: column;
}
.facts li {
  display: flex;
  gap: var(--space-4);
  padding-block: var(--space-4);
  border-top: 2px solid rgb(252 238 214 / 0.3);
}
.facts li:first-child {
  padding-top: 0;
  border-top: 0;
}
.facts svg {
  flex-shrink: 0;
  margin-top: 2px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
