<script setup lang="ts">
// The window's own title bar, one thin line across the whole window, as in Discord or VS Code.
// It holds the window buttons (drawn by the system: the traffic lights on the left on macOS,
// the three buttons on the right on Windows) and the app's name, and it drags the window.
// Its colour is the one main sends to Windows for the strip behind its buttons
// (setWindowColor, from --bg-sidebar), so the buttons look part of the bar.
</script>

<template>
  <div class="window-bar drag">
    <span class="app-name">SillySimple</span>
  </div>
</template>

<style scoped>
.window-bar {
  position: relative;
  height: var(--window-bar-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 var(--window-controls-right) 0 var(--window-controls-left);
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
}

.app-name {
  font-family: var(--font-prose);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-faint);
}

/* Windows: the name on the left, as a Windows app has it. */
html[data-platform='win32'] .app-name {
  padding-left: 12px;
}

/* macOS: the name in the middle, as a Mac window has its title. */
html[data-platform='darwin'] .window-bar {
  justify-content: center;
}
</style>
