<script setup lang="ts">
import { MotionConfig } from 'motion-v'

// The app's colours follow the character on screen.
useCharacterColors()
</script>

<template>
  <!-- reduced-motion="user": animations are skipped when the system asks for less motion -->
  <MotionConfig reduced-motion="user">
    <div class="window">
      <!-- One title bar for every screen: the window buttons live in it, never over the pages -->
      <AppTitleBar />
      <div class="window-body">
        <RouterView />
      </div>
    </div>
    <!-- Opened from anywhere with useCharacterEditor() -->
    <CharacterEditor />
    <!-- The one "are you sure?" dialog, opened from anywhere with useConfirm(). Last, so it shows above the editor. -->
    <ConfirmDialog />
    <!-- The guided tour of the chat screen, started with useTour() -->
    <AppTour />
  </MotionConfig>
</template>

<style scoped>
.window {
  display: flex;
  flex-direction: column;
  height: 100%;
}
/* Every page fills what the title bar leaves (they all use height: 100%). */
.window-body {
  flex: 1;
  min-height: 0;
}
</style>
