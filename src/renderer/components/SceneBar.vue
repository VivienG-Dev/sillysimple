<script setup lang="ts">
import { Volume2, VolumeX, X } from '@lucide/vue'

// The band under the chat's title when several characters are in the chat: who is
// there, a click to make one of them speak, and how they take turns.

const chatStore = useChatStore()

function toggleTurns(event: Event): void {
  void chatStore.setTurnMode((event.target as HTMLInputElement).checked ? 'round' : 'last')
}
</script>

<template>
  <div class="scene" role="group" aria-label="Characters in this chat">
    <div
      v-for="(member, index) in chatStore.members"
      :key="member.character.id"
      class="member"
      :class="{ quiet: member.quiet }"
    >
      <button
        type="button"
        class="speak"
        :disabled="chatStore.isBusy"
        :title="`Make ${member.character.name} speak now`"
        @click="chatStore.speak(member.character.id)"
      >
        <CharacterAvatar :name="member.character.name" :src="member.character.portraitUrl" :size="24" />
        <span class="member-name">{{ member.character.name }}</span>
      </button>
      <button
        type="button"
        class="tool"
        :aria-pressed="member.quiet"
        :aria-label="`Keep ${member.character.name} in the background`"
        :title="
          member.quiet
            ? 'In the background: only speaks when you click their name. Click to bring them back.'
            : 'Put in the background: they will only speak when you click their name'
        "
        :disabled="chatStore.isBusy"
        @click="chatStore.setQuiet(member.character.id, !member.quiet)"
      >
        <VolumeX v-if="member.quiet" :size="13" :stroke-width="2" />
        <Volume2 v-else :size="13" :stroke-width="2" />
      </button>
      <!-- The first one is the character the chat belongs to: it cannot leave its own chat -->
      <button
        v-if="index > 0"
        type="button"
        class="tool"
        :aria-label="`Remove ${member.character.name} from this chat`"
        title="Remove from this chat. What they said stays."
        :disabled="chatStore.isBusy"
        @click="chatStore.removeMember(member.character.id)"
      >
        <X :size="13" :stroke-width="2.2" />
      </button>
    </div>

    <label
      class="turns"
      title="On: after your message, each character replies in turn. Off: the one who spoke last replies."
    >
      <input type="checkbox" :checked="chatStore.turnMode === 'round'" :disabled="chatStore.isBusy" @change="toggleTurns" />
      Everyone replies in turn
    </label>
  </div>
</template>

<style scoped>
.scene {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bar-bg, none);
}

.member {
  display: flex;
  align-items: center;
  height: 32px;
  padding-right: 4px;
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
}
.member.quiet {
  border-style: dashed;
}
.member.quiet .speak {
  opacity: 0.6;
}

.speak {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 4px;
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-soft);
}
.speak:hover:not(:disabled) {
  color: var(--accent-soft);
}
.member-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--text-faint);
}
.tool:hover:not(:disabled) {
  background: var(--bg-selected);
  color: var(--text);
}
.tool[aria-pressed='true'] {
  color: var(--warning-text);
}

.turns {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.turns input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
}
</style>
