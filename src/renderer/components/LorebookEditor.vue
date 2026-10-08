<script setup lang="ts">
import { ChevronRight, Plus, Trash2, Upload } from '@lucide/vue'
import { parseJsonBytes, parseLorebookFile } from '@core/cards/parseCard'
import type { LorebookEntry } from '@shared/types'

// The "Lorebook" tab of the character editor: the list of a character's lore entries.
// Each entry is a note about the character's world, sent to the model only while one
// of its keywords comes up in the chat. One entry is unfolded at a time.
//
// An entry from another app can carry settings this editor does not show (a second
// set of keywords, a position, an order). They are left as they are.

const entries = defineModel<LorebookEntry[]>({ required: true })

/** The entry that is unfolded, by its place in the list. */
const openIndex = ref<number | null>(null)
const problem = ref('')
const root = ref<HTMLElement | null>(null)

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? null : index
}

async function add(): Promise<void> {
  entries.value.push(newLoreEntry())
  openIndex.value = entries.value.length - 1
  await nextTick()
  root.value?.querySelector<HTMLInputElement>('.entry.open input[type=text]')?.focus()
}

function remove(index: number): void {
  entries.value.splice(index, 1)
  if (openIndex.value === index) openIndex.value = null
  else if (openIndex.value !== null && openIndex.value > index) openIndex.value--
}

/** "harbor,  reef , " -> ["harbor", "reef"] */
function saveKeys(entry: LorebookEntry, event: Event): void {
  entry.keys = (event.target as HTMLInputElement).value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
}

/** What a folded entry shows: its title, or else its keywords. */
function summary(entry: LorebookEntry): string {
  return entry.name.trim() || entry.keys.join(', ') || (entry.constant ? 'Always included' : 'New entry')
}

// --- Import a lorebook file ------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // So picking the same file again is noticed.
  if (!file) return

  try {
    const imported = parseLorebookFile(parseJsonBytes(new Uint8Array(await file.arrayBuffer())))
    entries.value.push(...imported)
    problem.value = ''
  } catch (error) {
    problem.value = `${file.name} was not added. ${error instanceof Error ? error.message : String(error)}`
  }
}
</script>

<template>
  <div ref="root" class="lorebook">
    <p class="hint">
      Notes about the character's world: places, people, events. A note is sent to the model only while one of its
      keywords comes up in the last few messages, so a long background does not weigh on every reply.
    </p>

    <p v-if="entries.length === 0" class="empty">This character has no lorebook yet.</p>

    <div v-for="(entry, index) in entries" :key="index" class="entry" :class="{ open: openIndex === index }">
      <div class="entry-head">
        <button type="button" class="entry-toggle" :aria-expanded="openIndex === index" @click="toggle(index)">
          <ChevronRight class="chevron" :size="14" :stroke-width="2.2" />
          <span class="entry-title" :class="{ off: !entry.enabled }">{{ summary(entry) }}</span>
          <span v-if="!entry.enabled" class="badge">Off</span>
          <span v-else-if="entry.constant" class="badge">Always</span>
        </button>
        <button
          type="button"
          class="entry-remove"
          :aria-label="`Delete entry ${index + 1}`"
          title="Delete this entry"
          @click="remove(index)"
        >
          <Trash2 :size="14" :stroke-width="2" />
        </button>
      </div>

      <div v-if="openIndex === index" class="entry-body">
        <label>
          <span class="label">Keywords</span>
          <span class="hint">Separated by commas. The note is sent when one of them is mentioned.</span>
          <input
            class="field"
            type="text"
            :value="entry.keys.join(', ')"
            :disabled="entry.constant"
            placeholder="harbor, reef, the old port"
            @change="saveKeys(entry, $event)"
          />
        </label>
        <p v-if="entry.selective && entry.secondaryKeys.length" class="hint">
          Set in another app and kept: it also needs one of “{{ entry.secondaryKeys.join(', ') }}”.
        </p>
        <label>
          <span class="label">Note</span>
          <textarea v-model="entry.content" class="field" rows="4" />
        </label>
        <label class="check">
          <input v-model="entry.constant" type="checkbox" />
          Always send this note, whatever the chat is about
        </label>
        <label class="check">
          <input v-model="entry.enabled" type="checkbox" />
          In use
        </label>
        <label>
          <span class="label">Title <span class="optional">· optional, only shown in this list</span></span>
          <input v-model="entry.name" class="field" type="text" />
        </label>
      </div>
    </div>

    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <div class="actions">
      <button type="button" class="btn btn-small" @click="add"><Plus :size="14" :stroke-width="2" />Add an entry</button>
      <button type="button" class="btn btn-small" @click="fileInput?.click()">
        <Upload :size="14" :stroke-width="2" />Import a lorebook file
      </button>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept=".json"
        tabindex="-1"
        aria-hidden="true"
        @change="onFilePicked"
      />
    </div>
  </div>
</template>

<style scoped>
.lorebook {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-faint);
}
.lorebook > .hint {
  margin-bottom: 4px;
}
.empty {
  padding: 18px;
  background: var(--bg-sunken);
  border: 1px dashed var(--border-input);
  border-radius: var(--radius-md);
  color: var(--text-faint);
  text-align: center;
}

.entry {
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-md);
}
.entry.open {
  border-color: var(--border-hover);
}

.entry-head {
  display: flex;
  align-items: center;
}
.entry-toggle {
  flex: 1;
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: transparent;
  border: none;
  text-align: left;
}
.chevron {
  flex-shrink: 0;
  color: var(--text-faint);
  transition: transform 0.12s;
}
.open .chevron {
  transform: rotate(90deg);
}
.entry-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-title.off {
  color: var(--text-ghost);
}
.badge {
  flex-shrink: 0;
  padding: 1px 7px;
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-muted);
}
.entry-remove {
  width: 30px;
  height: 28px;
  margin-right: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.entry-remove:hover {
  background: var(--bg-button);
  color: var(--danger-text);
}

.entry-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 12px 14px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.label {
  font-size: 12.5px;
  font-weight: 600;
}
.optional {
  font-weight: 400;
  color: var(--text-faint);
}
.entry-body .field {
  background: var(--bg-panel);
}
.check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
}

.problem {
  font-size: 12.5px;
  color: var(--danger-text);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
