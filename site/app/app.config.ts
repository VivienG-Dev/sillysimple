// What changes without touching the page itself.

export default defineAppConfig({
  /**
   * Where each installer is downloaded from. Leave a line empty until its file exists:
   * the page then says the app is not out yet instead of showing a button that leads nowhere.
   */
  downloads: {
    mac: '',
    windows: '',
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
