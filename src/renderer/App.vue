<script setup lang="ts">
import { MotionConfig } from 'motion-v'

// The app's colours follow the character on screen.
useCharacterColors()
</script>

<template>
  <!-- reduced-motion="user": animations are skipped when the system asks for less motion -->
  <MotionConfig reduced-motion="user">
    <RouterView />
    <!-- Opened from anywhere with useCharacterEditor() -->
    <CharacterEditor />
    <!-- The one "are you sure?" dialog, opened from anywhere with useConfirm(). Last, so it shows above the editor. -->
    <ConfirmDialog />
    <!-- The guided tour of the chat screen, started with useTour() -->
    <AppTour />
  </MotionConfig>
</template>
