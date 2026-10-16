<script setup lang="ts">
import { ChevronsUpDown, Heart, Search, Settings } from '@lucide/vue'

// Left column of the chat screen: search, the character list, connection status, persona.

const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()

const search = ref('')

const visibleCharacters = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return charactersStore.ordered
  return charactersStore.ordered.filter((character) => character.name.toLowerCase().includes(query))
})
</script>

<template>
  <aside class="sidebar">
    <label class="search">
      <Search :size="14" :stroke-width="2" />
      <input v-model="search" type="text" placeholder="Search characters" aria-label="Search characters" />
    </label>

    <div class="list-header">
      <span class="eyebrow">Characters</span>
      <RouterLink to="/library" class="library-link">Library</RouterLink>
    </div>

    <nav class="list" aria-label="Characters">
      <button
        v-for="character in visibleCharacters"
        :key="character.id"
        type="button"
        class="item"
        :class="{ active: character.id === charactersStore.activeId }"
        :aria-current="character.id === charactersStore.activeId"
        @click="charactersStore.select(character.id)"
      >
        <CharacterAvatar :name="character.name" :src="character.portraitUrl" />
        <span class="item-text">
          <span class="item-name">
            <span class="item-name-text">{{ character.name }}</span>
            <Heart v-if="character.favorite" class="item-like" :size="11" :stroke-width="2" fill="currentColor" aria-label="Favourite" />
          </span>
          <span class="item-tagline">{{ character.tagline }}</span>
        </span>
      </button>
      <p v-if="visibleCharacters.length === 0" class="empty">
        {{ search ? `No character matches “${search}”.` : 'No characters yet.' }}
      </p>
    </nav>

    <footer class="footer">
      <UpdateButton />
      <ConnectionBadge />
      <div class="persona">
        <!-- With several personas, the whole block is a menu to switch between them -->
        <label class="persona-current" :class="{ switchable: settingsStore.personas.length > 1 }">
          <CharacterAvatar :name="settingsStore.persona.name" :size="30" round persona />
          <span class="persona-text">
            <span class="persona-name">{{ settingsStore.persona.name }}</span>
            <span class="persona-caption">Your persona</span>
          </span>
          <template v-if="settingsStore.personas.length > 1">
            <ChevronsUpDown class="persona-chevron" :size="14" :stroke-width="2" />
            <select
              class="persona-select"
              aria-label="Switch persona"
              :value="settingsStore.persona.id"
              @change="settingsStore.selectPersona(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in settingsStore.personas" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </template>
        </label>
        <RouterLink to="/settings" class="settings-button" aria-label="Settings" title="Settings">
          <Settings :size="16" :stroke-width="1.8" />
        </RouterLink>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  margin: 12px 12px;
  padding: 0 10px;
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
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  user-select: text;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px 8px;
}
.library-link {
  padding: 4px;
  font-size: 12px;
  font-weight: 600;
}

.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
  overflow-y: auto;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  text-align: left;
}
.item:hover {
  background: var(--bg-panel);
}
.item.active {
  background: var(--bg-active);
}

.item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--text);
}
.item-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-like {
  flex-shrink: 0;
  color: var(--like);
}
.item-tagline {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 8px;
  font-size: 12px;
  color: var(--text-faint);
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.persona {
  display: flex;
  align-items: center;
  gap: 10px;
}
.persona-current {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px;
  margin: -4px;
  border-radius: var(--radius);
}
.persona-current.switchable:hover {
  background: var(--bg-panel);
}
.persona-current:has(:focus-visible) {
  outline: 2px solid var(--accent-strong);
}
.persona-chevron {
  flex-shrink: 0;
  color: var(--text-faint);
}
/* The real menu, invisible, laid over the block: a click anywhere on it opens the system's own list. */
.persona-select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.persona-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.persona-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-caption {
  font-size: 11px;
  color: var(--text-faint);
}

.settings-button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  color: var(--text-muted);
}
.settings-button:hover {
  color: var(--text);
  border-color: var(--border-hover);
}
</style>
