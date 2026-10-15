import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { SillyApi } from '@shared/api'
import { IPC } from '@shared/ipc'
import type { ChatEvent, EngineStatus, NoticeEvent, PlaceEvent, UpdateStatus } from '@shared/types'

// The preload script is the only code that can talk to both sides.
// It exposes a small, fixed list of functions as `window.api`; the Vue app
// never gets direct access to Node or to Electron.

const api: SillyApi = {
  platform: process.platform,
  setWindowColor: (color) => ipcRenderer.send(IPC.windowColor, color),

  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    setBackground: (webp) => ipcRenderer.invoke(IPC.backgroundSet, webp),
    removeBackground: () => ipcRenderer.invoke(IPC.backgroundRemove),
  },

  connection: {
    test: (connection, apiKey) => ipcRenderer.invoke(IPC.connectionTest, connection, apiKey),
    contextLength: () => ipcRenderer.invoke(IPC.connectionContextLength),
  },

  engine: {
    status: (wake) => ipcRenderer.invoke(IPC.engineStatus, wake),
    download: (model) => ipcRenderer.invoke(IPC.engineDownload, model),
    cancel: () => ipcRenderer.send(IPC.engineCancel),
    remove: (model) => ipcRenderer.invoke(IPC.engineRemove, model),
    rest: () => ipcRenderer.send(IPC.engineRest),
    onStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, status: EngineStatus): void => listener(status)
      ipcRenderer.on(IPC.engineEvent, handler)
      return () => ipcRenderer.removeListener(IPC.engineEvent, handler)
    },
  },

  keys: {
    status: () => ipcRenderer.invoke(IPC.keysStatus),
    set: (slot, key) => ipcRenderer.invoke(IPC.keysSet, slot, key),
    remove: (slot) => ipcRenderer.invoke(IPC.keysRemove, slot),
  },

  mood: {
    read: (text, userName) => ipcRenderer.invoke(IPC.moodRead, text, userName),
    status: () => ipcRenderer.invoke(IPC.moodStatus),
  },

  voice: {
    check: (settings, apiKey) => ipcRenderer.invoke(IPC.voiceCheck, settings, apiKey),
    speak: (request) => ipcRenderer.invoke(IPC.voiceSpeak, request),
    sample: (request) => ipcRenderer.invoke(IPC.voiceSample, request),
    cancel: (requestId) => ipcRenderer.send(IPC.voiceCancel, requestId),
  },

  characters: {
    list: () => ipcRenderer.invoke(IPC.charactersList),
    import: (paths) => ipcRenderer.invoke(IPC.charactersImport, paths),
    create: (draft, portrait) => ipcRenderer.invoke(IPC.charactersCreate, draft, portrait),
    update: (id, draft, portrait) => ipcRenderer.invoke(IPC.charactersUpdate, id, draft, portrait),
    write: (request) => ipcRenderer.invoke(IPC.charactersWrite, request),
    improve: (request) => ipcRenderer.invoke(IPC.charactersImprove, request),
    color: (id) => ipcRenderer.invoke(IPC.charactersColor, id),
    setFavorite: (id, favorite) => ipcRenderer.invoke(IPC.charactersFavorite, id, favorite),
    setVoice: (id, service, voice) => ipcRenderer.invoke(IPC.charactersVoice, id, service, voice),
    // Stays in the preload: only Electron knows where a dropped File lives on disk.
    pathForFile: (file) => webUtils.getPathForFile(file),
    delete: (id) => ipcRenderer.invoke(IPC.charactersDelete, id),
    export: (id) => ipcRenderer.invoke(IPC.charactersExport, id),
  },

  scenarios: {
    list: () => ipcRenderer.invoke(IPC.scenariosList),
    play: (id) => ipcRenderer.invoke(IPC.scenariosPlay, id),
  },
  authors: {
    list: () => ipcRenderer.invoke(IPC.authorsList),
  },

  chats: {
    list: (characterId) => ipcRenderer.invoke(IPC.chatsList, characterId),
    open: (chatId) => ipcRenderer.invoke(IPC.chatsOpen, chatId),
    create: (characterId) => ipcRenderer.invoke(IPC.chatsCreate, characterId),
    delete: (chatId) => ipcRenderer.invoke(IPC.chatsDelete, chatId),
    setScene: (chatId, scene) => ipcRenderer.invoke(IPC.chatsSetScene, chatId, scene),
    setMemory: (chatId, summary) => ipcRenderer.invoke(IPC.chatsSetMemory, chatId, summary),
    setStory: (chatId, note) => ipcRenderer.invoke(IPC.chatsSetStory, chatId, note),
    setPlace: (chatId, place) => ipcRenderer.invoke(IPC.chatsSetPlace, chatId, place),
    setOutfit: (chatId, characterId, outfit) => ipcRenderer.invoke(IPC.chatsSetOutfit, chatId, characterId, outfit),
  },

  messages: {
    edit: (messageId, content) => ipcRenderer.invoke(IPC.messagesEdit, messageId, content),
    delete: (messageId) => ipcRenderer.invoke(IPC.messagesDelete, messageId),
    selectSwipe: (messageId, index) => ipcRenderer.invoke(IPC.messagesSelectSwipe, messageId, index),
  },

  data: {
    summary: () => ipcRenderer.invoke(IPC.dataSummary),
    openFolder: () => ipcRenderer.invoke(IPC.dataOpenFolder),
    backup: () => ipcRenderer.invoke(IPC.dataBackup),
    chooseBackup: () => ipcRenderer.invoke(IPC.dataChooseBackup),
    restore: () => ipcRenderer.invoke(IPC.dataRestore),
    deleteChats: () => ipcRenderer.invoke(IPC.dataDeleteChats),
    erase: () => ipcRenderer.invoke(IPC.dataErase),
  },

  chat: {
    start: (request) => ipcRenderer.invoke(IPC.chatStart, request),
    cancel: (requestId) => ipcRenderer.send(IPC.chatCancel, requestId),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, chatEvent: ChatEvent): void => listener(chatEvent)
      ipcRenderer.on(IPC.chatEvent, handler)
      return () => ipcRenderer.removeListener(IPC.chatEvent, handler)
    },
    onNotice: (listener) => {
      const handler = (_event: IpcRendererEvent, notice: NoticeEvent): void => listener(notice)
      ipcRenderer.on(IPC.chatNotice, handler)
      return () => ipcRenderer.removeListener(IPC.chatNotice, handler)
    },
    onPlace: (listener) => {
      const handler = (_event: IpcRendererEvent, place: PlaceEvent): void => listener(place)
      ipcRenderer.on(IPC.chatPlace, handler)
      return () => ipcRenderer.removeListener(IPC.chatPlace, handler)
    },
  },

  updates: {
    status: () => ipcRenderer.invoke(IPC.updatesStatus),
    check: () => ipcRenderer.invoke(IPC.updatesCheck),
    download: () => ipcRenderer.send(IPC.updatesDownload),
    install: () => ipcRenderer.send(IPC.updatesInstall),
    onStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, status: UpdateStatus): void => listener(status)
      ipcRenderer.on(IPC.updatesEvent, handler)
      return () => ipcRenderer.removeListener(IPC.updatesEvent, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
