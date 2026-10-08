/** "Mac" on macOS, "PC" on Windows, "computer" elsewhere. For sentences like "On this Mac". */
export function deviceName(): string {
  if (window.api.platform === 'darwin') return 'Mac'
  if (window.api.platform === 'win32') return 'PC'
  return 'computer'
}

/** Where deleted files go: "Trash" on macOS, "Recycle Bin" on Windows. */
export function trashName(): string {
  if (window.api.platform === 'darwin') return 'Trash'
  if (window.api.platform === 'win32') return 'Recycle Bin'
  return 'trash'
}

/** The key used for shortcuts: ⌘ on macOS, Ctrl elsewhere. */
export function shortcutKey(): string {
  return window.api.platform === 'darwin' ? '⌘' : 'Ctrl'
}
