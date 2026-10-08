// Asks "are you sure?" before something that cannot be undone:
//
//   const { confirm } = useConfirm()
//   if (await confirm({ title: 'Delete this chat?', message: '…', confirmLabel: 'Delete chat' })) { … }
//
// The dialog itself is <ConfirmDialog />, mounted once in App.vue.

export interface ConfirmRequest {
  title: string
  message: string
  /** What the button that goes ahead says, e.g. "Delete chat". */
  confirmLabel: string
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void
}

// Declared outside the function: every caller shares the one dialog.
const pending = ref<PendingConfirm | null>(null)

export function useConfirm() {
  function confirm(request: ConfirmRequest): Promise<boolean> {
    pending.value?.resolve(false) // A second question replaces the first, which counts as "no".
    return new Promise((resolve) => {
      pending.value = { ...request, resolve }
    })
  }

  function answer(confirmed: boolean): void {
    pending.value?.resolve(confirmed)
    pending.value = null
  }

  return { pending, confirm, answer }
}
