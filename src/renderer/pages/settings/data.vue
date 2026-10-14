<script setup lang="ts">
import { FolderOpen } from '@lucide/vue'
import { cloudProvider, isLocalAddress, voiceDestination } from '@shared/providers'
import type { Attempt, BackupInfo, DataSummary } from '@shared/types'

// What the app keeps on this computer, what leaves it, and the three things a user
// can do about it: save a backup, restore one, delete.

const settingsStore = useSettingsStore()
const { confirm } = useConfirm()

const summary = ref<DataSummary | null>(null)
async function refresh(): Promise<void> {
  summary.value = await window.api.data.summary()
}
onMounted(refresh)

const showFolder = (): Promise<void> => window.api.data.openFolder()

function setCheckUpdates(event: Event): void {
  void settingsStore.update({ updates: { check: (event.target as HTMLInputElement).checked } })
}

const count = (total: number, one: string, many: string): string => `${total.toLocaleString('en')} ${total === 1 ? one : many}`
const contents = (item: Pick<DataSummary, 'characters' | 'chats' | 'messages'>): string =>
  [
    count(item.characters, 'character', 'characters'),
    count(item.chats, 'chat', 'chats'),
    count(item.messages, 'message', 'messages'),
  ].join(' · ')

/** Where replies are written, which is the one thing that can send text elsewhere. */
const leaves = computed<{ nothing: boolean; text: string }>(() => {
  const connection = settingsStore.connection
  if (connection.kind === 'cloud') {
    const service = cloudProvider(connection.provider)?.name ?? 'the online service you chose'
    return {
      nothing: false,
      text: `To write a reply, the conversation and the character's card are sent to ${service}. What happens to them there is up to ${service}: see its privacy policy. Nothing else leaves this computer.`,
    }
  }
  if (isLocalAddress(connection.baseUrl)) {
    const server = connection.kind === 'ollama' ? 'a model' : 'a model server'
    return { nothing: true, text: `Nothing. Replies are written by ${server} running on this computer.` }
  }
  let host = connection.baseUrl
  try {
    host = new URL(connection.baseUrl).host
  } catch {
    // Not an address yet: show it as typed.
  }
  return {
    nothing: false,
    text: `To write a reply, the conversation and the character's card are sent to the model server at ${host}. Nothing else leaves this computer.`,
  }
})

/** Reading replies aloud sends their text to the voice service, when that one is not on this computer. */
const voiceLeaves = computed(() => {
  const destination = voiceDestination(settingsStore.voice)
  return destination
    ? `To read a reply aloud, its text is sent to ${destination}, only when it is read. You choose this in Settings > Voice.`
    : ''
})

// --- Actions -----------------------------------------------------------------------

const busy = ref(false)
type Section = 'backup' | 'delete'
/** What the last action did, shown in its own section, right under the button that was clicked. */
const outcome = ref<{ section: Section; kind: 'done' | 'error'; text: string } | null>(null)

/** Runs one action at a time and reports a failure. Returns its value when it went through. */
async function run<T>(section: Section, action: () => Promise<Attempt<T>>): Promise<{ value: T } | null> {
  busy.value = true
  outcome.value = null
  try {
    const result = await action()
    if (result.status === 'done') return { value: result.value }
    if (result.status === 'error') outcome.value = { section, kind: 'error', text: result.error }
    return null
  } finally {
    busy.value = false
  }
}

/** After the files changed under the app: start again from the first screen, with everything read anew. */
function startOver(): void {
  window.location.hash = '#/'
  window.location.reload()
}

async function saveBackup(): Promise<void> {
  const saved = await run('backup', () => window.api.data.backup())
  if (saved) outcome.value = { section: 'backup', kind: 'done', text: `Saved ${saved.value.fileName} (${contents(saved.value)}).` }
}

const longDate = (timestamp: number): string => new Date(timestamp).toLocaleDateString(undefined, { dateStyle: 'long' })

async function restoreBackup(): Promise<void> {
  const chosen = await run<BackupInfo>('backup', () => window.api.data.chooseBackup())
  if (!chosen) return

  const backup = chosen.value
  const confirmed = await confirm({
    title: 'Restore this backup?',
    message: `${backup.fileName}, saved on ${longDate(backup.createdAt)}: ${contents(backup)}. The characters, chats and settings now in the app are replaced by those of the backup. API keys are kept.`,
    confirmLabel: 'Restore backup',
  })
  if (confirmed && (await run('backup', () => window.api.data.restore()))) startOver()
}

async function deleteChats(): Promise<void> {
  const confirmed = await confirm({
    title: 'Delete all chats?',
    message: `${count(summary.value?.chats ?? 0, 'chat', 'chats')} will be erased from this computer for good. Characters and settings stay.`,
    confirmLabel: 'Delete all chats',
  })
  if (!confirmed || !(await run('delete', () => window.api.data.deleteChats()))) return

  outcome.value = { section: 'delete', kind: 'done', text: 'All chats were deleted.' }
  await refresh()
  // The chat screen holds the chats that are gone: have it read them again.
  await Promise.all([useCharactersStore().load(), useChatStore().reload()])
}

async function eraseEverything(): Promise<void> {
  const confirmed = await confirm({
    title: 'Erase everything?',
    message: 'Characters, chats, settings and API keys are erased from this computer for good, and the app starts over as on its first launch. Without a backup, none of it can be brought back.',
    confirmLabel: 'Erase everything',
  })
  if (confirmed && (await run('delete', () => window.api.data.erase()))) startOver()
}
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Data &amp; Privacy</h1>
      <p>What SillySimple keeps, where it is, and what leaves this computer.</p>
    </header>

    <section class="card">
      <h2 class="card-title">On this computer</h2>
      <p class="text">
        Your characters, chats and settings are files in one folder on this computer. There is no account, and
        nothing you write is ever sent to us.
      </p>
      <div v-if="summary" class="folder">
        <div class="folder-text">
          <span class="contents">{{ contents(summary) }} · {{ formatBytes(summary.bytes) }}</span>
          <span class="path">{{ summary.folder }}</span>
        </div>
        <button type="button" class="btn btn-small" @click="showFolder">
          <FolderOpen :size="13" :stroke-width="2" />Show folder
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">What leaves this computer</h2>
      <p class="text leaves" :class="{ nothing: leaves.nothing }">{{ leaves.text }}</p>
      <p v-if="voiceLeaves" class="text leaves">{{ voiceLeaves }}</p>
      <label class="toggle">
        <input type="checkbox" aria-label="Check for new versions" :checked="settingsStore.updates.check" @change="setCheckUpdates" />
        <span class="toggle-text">
          <span class="toggle-title">Check for new versions</span>
          <span class="toggle-hint">
            At launch and every few hours, the app reads a small file at downloads.sillysimple.app that says which
            version is the latest. Nothing about you or your chats is sent; like any website, the server sees the
            address it is asked from. Nothing is downloaded until you click.
          </span>
        </span>
      </label>
      <p class="hint">
        Replies depend on where they are written, which you choose in
        <RouterLink to="/settings/connection">Connection</RouterLink>. API keys of online services are encrypted by
        this computer, and are never part of a backup.
      </p>
    </section>

    <section class="card">
      <h2 class="card-title">Backup</h2>
      <p class="text">
        A backup is one .zip file with your characters, chats and settings. Keep it somewhere safe, or use it to move
        to another computer.
      </p>
      <div class="buttons">
        <button type="button" class="btn" :disabled="busy" @click="saveBackup">Save a backup…</button>
        <button type="button" class="btn" :disabled="busy" @click="restoreBackup">Restore a backup…</button>
      </div>
      <p
        v-if="outcome?.section === 'backup'"
        class="outcome"
        :class="outcome.kind"
        :role="outcome.kind === 'error' ? 'alert' : 'status'"
      >
        {{ outcome.text }}
      </p>
    </section>

    <section class="card">
      <h2 class="card-title">Delete</h2>
      <div class="row">
        <div class="row-text">
          <span class="row-title">Delete all chats</span>
          <span class="hint">Every conversation is erased from this computer. Characters and settings stay.</span>
        </div>
        <button type="button" class="btn btn-small danger" :disabled="busy || !summary?.chats" @click="deleteChats">
          Delete all chats…
        </button>
      </div>
      <div class="row">
        <div class="row-text">
          <span class="row-title">Erase everything</span>
          <span class="hint">
            Characters, chats, settings and API keys are erased, and the app starts over as on its first launch.
            Models you downloaded stay: they are removed one by one in Settings › Connection.
          </span>
        </div>
        <button type="button" class="btn btn-small danger" :disabled="busy" @click="eraseEverything">
          Erase everything…
        </button>
      </div>
      <p
        v-if="outcome?.section === 'delete'"
        class="outcome"
        :class="outcome.kind"
        :role="outcome.kind === 'error' ? 'alert' : 'status'"
      >
        {{ outcome.text }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
h1 {
  font-size: 26px;
}
header p {
  color: var(--text-dim);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}
.card-title {
  font-size: 14px;
  font-weight: 700;
}
.text {
  color: var(--text-muted);
  line-height: 1.55;
}
.hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}
.hint a {
  font-weight: 600;
}

.folder {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  background: var(--bg-sunken);
  border-radius: var(--radius);
}
.folder-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.contents {
  font-weight: 600;
}
.path {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-faint);
  overflow-wrap: anywhere;
  user-select: text;
}

/* Said plainly, and greener when the answer is "nothing". */
.leaves {
  color: var(--text);
}
.leaves.nothing {
  color: var(--success-text);
}

.buttons {
  display: flex;
  gap: 10px;
}

.toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.toggle input {
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
  flex-shrink: 0;
  accent-color: var(--accent);
}
.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.toggle-title {
  font-weight: 600;
}
.toggle-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.row-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.row-title {
  font-weight: 600;
}
.btn.danger {
  color: var(--danger-text);
}
.btn.danger:hover:not(:disabled) {
  border-color: var(--danger-border);
}

.outcome {
  padding: 10px 12px;
  background: var(--success-bg);
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--success-text);
}
.outcome.error {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text);
}
</style>
