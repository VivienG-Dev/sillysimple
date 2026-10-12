<script setup lang="ts">
// The one confirmation dialog of the app, driven by useConfirm().
// A native <dialog> opened with showModal() traps the keyboard focus and closes on Escape by itself.

const { pending, answer } = useConfirm()
const dialog = ref<HTMLDialogElement | null>(null)

// flush: 'post' = run after the buttons are rendered, so the dialog can focus Cancel when it opens.
watch(
  pending,
  (request) => {
    if (request) dialog.value?.showModal()
    else dialog.value?.close()
  },
  { flush: 'post' },
)

/** A click on the dimmed area around the box lands on the <dialog> element itself. */
function onClick(event: MouseEvent): void {
  if (event.target === dialog.value) answer(false)
}
</script>

<template>
  <dialog ref="dialog" class="confirm" @cancel.prevent="answer(false)" @click="onClick">
    <form v-if="pending" class="box" @submit.prevent="answer(true)">
      <h2 class="title-serif">{{ pending.title }}</h2>
      <p>{{ pending.message }}</p>
      <div class="actions">
        <!-- Cancel is first and focused: pressing Enter by reflex must not delete anything -->
        <button type="button" class="btn" autofocus @click="answer(false)">Cancel</button>
        <button type="submit" class="btn btn-danger">{{ pending.confirmLabel }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.confirm {
  width: 400px;
  max-width: calc(100vw - 48px);
  padding: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  color: var(--text);
}
.confirm::backdrop {
  background: rgb(11 7 4 / 0.6);
}

.box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
}
h2 {
  font-size: 19px;
}
p {
  color: var(--text-muted);
  line-height: 1.55;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
</style>
