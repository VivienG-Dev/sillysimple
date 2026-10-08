<script setup lang="ts">
// Writing to the publisher: a short form, sent by the site's small server as an email
// (server/api/contact.post.ts). The answer comes from contact@sillysimple.app.
//
// No puzzle to solve: a field people do not see, which robots fill in, and the time the
// form took to fill, are enough for a site this size. Without scripts the form cannot be
// sent, and the page says to write to the address instead.

definePageMeta({ layout: 'doc' })

usePage({
  title: 'Contact',
  description: 'Write to the person who makes SillySimple: a question, something that does not work, or an idea.',
  path: '/contact/',
})

const ADDRESS = 'contact@sillysimple.app'

const ABOUT = [
  { value: 'question', label: 'A question' },
  { value: 'problem', label: 'Something does not work' },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Something else' },
]

const form = reactive({ name: '', email: '', about: 'question', message: '', website: '' })
const started = ref(0)
onMounted(() => (started.value = Date.now()))

type State = 'writing' | 'sending' | 'sent' | 'failed'
const state = ref<State>('writing')
const problem = ref('')

const guide = computed(() =>
  state.value === 'sent'
    ? { title: 'Thank you!', text: `Your message is on its way. The answer will come from ${ADDRESS}, so keep an eye on your spam folder just in case.`, mood: 'happy' as const }
    : {
        title: 'Contact',
        text: 'A question, something that does not work, an idea? Write it here: it goes straight to the person who makes SillySimple, who reads everything and answers as soon as possible.',
        mood: 'idle' as const,
      },
)

async function send(): Promise<void> {
  if (state.value === 'sending') return
  state.value = 'sending'
  problem.value = ''
  try {
    await $fetch('/api/contact', { method: 'POST', body: { ...form, started: started.value } })
    state.value = 'sent'
  } catch (error) {
    const status = (error as { statusCode?: number; statusMessage?: string })?.statusCode
    const what = (error as { statusMessage?: string })?.statusMessage
    problem.value =
      status === 400 && what === 'email'
        ? 'That email address does not look right: the answer would not reach you.'
        : status === 400 && what === 'message'
          ? 'The message should be between 10 and 5,000 characters.'
          : status === 429
            ? 'Several messages were just sent from here. Wait a few minutes, then try again.'
            : `The message could not be sent. You can write to ${ADDRESS} instead.`
    state.value = 'failed'
  }
}
</script>

<template>
  <div class="contact">
    <MascotGuide heading="h1" :title="guide.title" :text="guide.text" :mood="guide.mood" />

    <form v-if="state !== 'sent'" class="form" novalidate @submit.prevent="send">
      <div class="pair">
        <label class="field">
          <span>Your name <em>(if you like)</em></span>
          <input v-model="form.name" type="text" name="name" autocomplete="name" maxlength="100" />
        </label>
        <label class="field">
          <span>Your email</span>
          <input v-model="form.email" type="email" name="email" autocomplete="email" maxlength="200" required />
        </label>
      </div>

      <label class="field">
        <span>What is it about?</span>
        <select v-model="form.about" name="about">
          <option v-for="item in ABOUT" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>

      <label class="field">
        <span>Your message</span>
        <textarea v-model="form.message" name="message" rows="8" minlength="10" maxlength="5000" required />
        <small v-if="form.about === 'problem'">Say which computer it is on (Mac, Windows or Linux) and what you were doing when it happened.</small>
      </label>

      <!-- For robots only: people never see it, so it stays empty. -->
      <div class="trap" aria-hidden="true">
        <label>Website <input v-model="form.website" type="text" name="website" tabindex="-1" autocomplete="off" /></label>
      </div>

      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

      <div class="foot">
        <button class="btn btn-main" type="submit" :disabled="state === 'sending'">
          {{ state === 'sending' ? 'Sending…' : 'Send' }}
        </button>
        <p class="note">
          Your message, your address and your name go by email to the person who makes SillySimple, only to answer you.
          <NuxtLink to="/legal/">More in the legal notice.</NuxtLink>
        </p>
      </div>

      <noscript>
        <p class="problem">This form needs scripts to be sent. You can write to <a :href="`mailto:${ADDRESS}`">{{ ADDRESS }}</a> instead.</p>
      </noscript>
    </form>

    <p v-else class="again">
      <button class="btn btn-cream" type="button" @click="(form.message = ''), (state = 'writing')">Write another message</button>
    </p>

    <p class="elsewhere">
      Looking for a quick answer? <NuxtLink to="/help/">The Help page</NuxtLink> may already have it. You can also write directly to
      <a :href="`mailto:${ADDRESS}`">{{ ADDRESS }}</a>.
    </p>
  </div>
</template>

<style scoped>
.contact {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
  max-width: 44em;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-weight: 700;
}
.field em {
  font-style: normal;
  font-weight: 400;
  color: var(--panel-soft);
}
.field small {
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--panel-soft);
}
input,
select,
textarea {
  width: 100%;
  padding: 12px 16px;
  background: var(--field-bg);
  color: var(--field-text);
  border: 2px solid var(--field-line);
  border-radius: var(--radius-lg);
  font: inherit;
  font-weight: 400;
}
input,
select {
  min-height: 52px;
}
textarea {
  min-height: 12em;
  resize: vertical;
  line-height: 1.5;
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}

/* Out of sight and out of reach, but still in the page for robots to fill in. */
.trap {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-5);
}
.foot .btn[disabled] {
  opacity: 0.7;
  cursor: progress;
}
.note {
  flex: 1 1 18em;
  margin: 0;
  font-size: var(--text-small);
  color: var(--panel-soft);
}
.problem {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--orange);
  background: var(--panel-bg);
  border-radius: var(--radius);
}
.again {
  margin: 0;
}
.elsewhere {
  margin: 0;
  color: var(--panel-soft);
}

@media (max-width: 640px) {
  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
