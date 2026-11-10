<script setup lang="ts">
import { Heart, Search, UserPlus } from '@lucide/vue'
import { applyMacros } from '@core/prompt/macros'
import type { Character } from '@shared/types'

// "Add a character": a button that opens a panel of the characters that can join the
// chat, each with their picture and the start of who they are, so the right one is
// found at a glance. A search field shows once the list is long. Arrow keys move,
// Enter adds, Escape or a click elsewhere closes.

const props = defineProps<{
  characters: Character[]
  disabled?: boolean
  /** The button's tooltip: why it is greyed out, or what it does. */
  title: string
  /** How many more characters the chat can take. */
  placesLeft: number
  /** The user's persona name, for {{user}} in what is shown. */
  userName: string
}>()

const emit = defineEmits<{ pick: [id: string] }>()

const SEARCH_FROM = 7

const open = ref(false)
const query = ref('')
const active = ref(0)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const searchField = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const place = ref({ top: 0, right: 0, maxHeight: 400 })

/** Who they are, in a line or two: the tagline, or else the start of the description. */
function blurb(character: Character): string {
  const text = character.tagline.trim() || character.description.trim()
  return applyMacros(text, { char: character.name, user: props.userName })
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

const shown = computed(() => {
  const words = query.value.trim().toLowerCase()
  const items = props.characters.map((character) => ({ character, blurb: blurb(character) }))
  if (!words) return items
  return items.filter(
    ({ character, blurb }) =>
      character.name.toLowerCase().includes(words) ||
      blurb.toLowerCase().includes(words) ||
      character.tags.some((tag) => tag.toLowerCase().includes(words)),
  )
})
watch(query, () => (active.value = 0))

function layout(): void {
  const box = button.value?.getBoundingClientRect()
  if (!box) return
  const top = box.bottom + 6
  place.value = { top, right: Math.max(8, window.innerWidth - box.right), maxHeight: Math.max(220, window.innerHeight - top - 16) }
}

async function toggle(): Promise<void> {
  if (open.value) return close()
  if (props.disabled) return
  layout()
  query.value = ''
  active.value = 0
  open.value = true
  await nextTick()
  if (searchField.value) searchField.value.focus()
  else panel.value?.focus()
}

function close(returnFocus = false): void {
  open.value = false
  if (returnFocus) button.value?.focus()
}

function pick(id: string): void {
  close(true)
  emit('pick', id)
}

function move(by: number): void {
  const count = shown.value.length
  if (count === 0) return
  active.value = (active.value + by + count) % count
  void nextTick(() => list.value?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') move(1)
  else if (event.key === 'ArrowUp') move(-1)
  else if (event.key === 'Enter') {
    const item = shown.value[active.value]
    if (item) pick(item.character.id)
  } else if (event.key === 'Escape') close(true)
  else return
  event.preventDefault()
  event.stopPropagation()
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Node
  if (!panel.value?.contains(target) && !button.value?.contains(target)) close()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', layout)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('resize', layout)
  }
})
watch(
  () => props.disabled,
  (disabled) => disabled && close(),
)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <button
    ref="button"
    type="button"
    class="btn btn-small add-character"
    :class="{ open }"
    :title="title"
    :disabled="disabled"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="toggle"
  >
    <UserPlus :size="14" :stroke-width="2" />Add a character
  </button>

  <Teleport to="body">
    <Transition name="drop">
      <section
        v-if="open"
        ref="panel"
        class="menu"
        tabindex="-1"
        aria-label="Add a character to this chat"
        :style="{ top: `${place.top}px`, right: `${place.right}px`, maxHeight: `${place.maxHeight}px` }"
        @keydown="onKeydown"
      >
        <header class="menu-head">
          <span class="menu-title">Add to this chat</span>
          <span class="menu-places">{{ placesLeft === 1 ? 'one more place' : `${placesLeft} more places` }}</span>
        </header>

        <label v-if="characters.length >= SEARCH_FROM" class="search">
          <Search :size="13" :stroke-width="2" />
          <input ref="searchField" v-model="query" type="search" placeholder="Search by name, tag…" aria-label="Search characters" />
        </label>

        <ul ref="list" class="items" role="listbox" aria-label="Characters">
          <li
            v-for="({ character, blurb: line }, index) in shown"
            :key="character.id"
            class="item"
            :class="{ active: index === active }"
            role="option"
            :aria-selected="index === active"
            @pointerenter="active = index"
            @click="pick(character.id)"
          >
            <CharacterAvatar class="picture" :name="character.name" :src="character.portraitUrl" :size="46" />
            <span class="text">
              <span class="name">
                {{ character.name }}
                <Heart v-if="character.favorite" class="like" :size="11" :stroke-width="2" fill="currentColor" aria-label="Favourite" />
              </span>
              <span v-if="line" class="blurb">{{ line }}</span>
            </span>
          </li>
          <li v-if="shown.length === 0" class="nothing">No character matches “{{ query }}”.</li>
        </ul>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.add-character {
  -webkit-app-region: no-drag;
}
.add-character.open {
  border-color: var(--accent-strong);
}

.menu {
  position: fixed;
  z-index: 50;
  width: 340px;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-lg);
  box-shadow:
    0 18px 48px rgb(0 0 0 / 0.45),
    0 2px 8px rgb(0 0 0 / 0.3);
  overflow: hidden;
  outline: none;
  -webkit-app-region: no-drag;
}

.menu-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 8px;
}
.menu-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
}
.menu-places {
  font-size: 11.5px;
  color: var(--text-faint);
}

.search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 10px 6px;
  padding: 0 10px;
  height: 32px;
  background: var(--bg-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  color: var(--text-faint);
}
.search:focus-within {
  border-color: var(--accent-strong);
}
.search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12.5px;
}

.items {
  margin: 0;
  padding: 4px 6px 8px;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
}
.item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.item.active {
  background: var(--bg-selected);
}
.picture {
  flex-shrink: 0;
  border-radius: var(--radius);
  object-fit: cover;
  object-position: top;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.like {
  flex-shrink: 0;
  color: var(--like);
}
.blurb {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-dim);
}
.item.active .blurb {
  color: var(--text-muted);
}
.nothing {
  padding: 14px 8px;
  font-size: 12px;
  color: var(--text-faint);
}

.drop-enter-active,
.drop-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  transform-origin: top right;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .drop-enter-active,
  .drop-leave-active {
    transition: none;
  }
}
</style>
