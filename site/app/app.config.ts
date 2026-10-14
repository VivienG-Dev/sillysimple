// What changes without touching the page itself.

export default defineAppConfig({
  /**
   * Where each installer is downloaded from. Leave a line empty until its file exists:
   * the page then says the app is not out yet instead of showing a button that leads nowhere.
   */
  downloads: {
    /** The Mac with an Apple chip (M1 or later): SillySimple-<version>-mac-arm64.dmg. */
    mac: 'https://downloads.sillysimple.app/SillySimple-0.1.2-mac-arm64.dmg',
    /** The Mac with an Intel chip: SillySimple-<version>-mac-x64.dmg. Shown as a smaller link under the Mac button. */
    macIntel: 'https://downloads.sillysimple.app/SillySimple-0.1.2-mac-x64.dmg',
    windows: 'https://downloads.sillysimple.app/SillySimple-0.1.2-win-x64.exe',
    linux: '',
  },
  /** The address of the site once it is online (https://…), for the picture shown when its link is shared. */
  url: 'https://sillysimple.app',
  /**
   * Where the code is, once it is public (https://github.com/…, without a slash at the end).
   * Until then the page says the app is free, and does not call it open source: nobody could
   * go and look. With it, the top of the page, the foot and Help link to the code.
   */
  repo: '',
})
