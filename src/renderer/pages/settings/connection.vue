<script setup lang="ts">
const justSaved = ref(false)

function onSaved(): void {
  justSaved.value = true
  setTimeout(() => (justSaved.value = false), 2000)
}
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Connection</h1>
      <p>Where replies come from, and which model writes them.</p>
    </header>

    <ConnectionPicker :save-label="justSaved ? 'Saved' : 'Save'" @saved="onSaved" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
</style>
