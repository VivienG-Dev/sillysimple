<script setup lang="ts">
// A character's picture, or a colored tile with initials when the card has none.
// `persona` marks the user's own avatar.
const props = withDefaults(
  defineProps<{ name: string; src?: string; size?: number; round?: boolean; persona?: boolean }>(),
  { size: 36, round: false, persona: false },
)

const colors = computed(() => (props.persona ? PERSONA_COLORS : avatarColors(props.name)))
</script>

<template>
  <img
    v-if="src"
    class="avatar picture"
    :class="{ round }"
    :src="src"
    :style="{ width: `${size}px`, height: `${size}px` }"
    alt=""
    draggable="false"
  />
  <span
    v-else
    class="avatar"
    :class="{ round }"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: colors.bg,
      color: colors.fg,
      fontSize: size >= 40 ? '13px' : '12px',
    }"
    aria-hidden="true"
  >
    {{ initials(name) }}
  </span>
</template>

<style scoped>
.avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 28%;
  font-weight: 700;
}
.avatar.round {
  border-radius: 50%;
}
/* Card pictures are tall portraits: keep the top, where the face usually is. */
.picture {
  object-fit: cover;
  object-position: top center;
}
</style>
