// Channel names for messages between the main process and the Vue app.
// One list, so a typo cannot silently break a call.

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  backgroundSet: 'background:set',
  backgroundRemove: 'background:remove',
  connectionTest: 'connection:test',
  connectionContextLength: 'connection:context-length',
  engineStatus: 'engine:status',
  engineDownload: 'engine:download',
  engineCancel: 'engine:cancel',
  engineRemove: 'engine:remove',
  engineRest: 'engine:rest',
  engineEvent: 'engine:event',
  moodRead: 'mood:read',
  moodStatus: 'mood:status',
  keysStatus: 'keys:status',
  keysSet: 'keys:set',
  keysRemove: 'keys:remove',
  charactersList: 'characters:list',
  charactersImport: 'characters:import',
  charactersCreate: 'characters:create',
  charactersUpdate: 'characters:update',
  charactersWrite: 'characters:write',
  charactersImprove: 'characters:improve',
  charactersColor: 'characters:color',
  charactersFavorite: 'characters:favorite',
  charactersVoice: 'characters:voice',
  windowColor: 'window:color',
  charactersDelete: 'characters:delete',
  scenariosList: 'scenarios:list',
  scenariosPlay: 'scenarios:play',
  authorsList: 'authors:list',
  chatsList: 'chats:list',
  chatsOpen: 'chats:open',
  chatsCreate: 'chats:create',
  chatsDelete: 'chats:delete',
  chatsSetScene: 'chats:set-scene',
  chatsSetMemory: 'chats:set-memory',
  chatsSetStory: 'chats:set-story',
  chatsSetPlace: 'chats:set-place',
  chatsSetOutfit: 'chats:set-outfit',
  messagesEdit: 'messages:edit',
  messagesDelete: 'messages:delete',
  messagesSelectSwipe: 'messages:select-swipe',
  dataSummary: 'data:summary',
  dataOpenFolder: 'data:open-folder',
  dataBackup: 'data:backup',
  dataChooseBackup: 'data:choose-backup',
  dataRestore: 'data:restore',
  dataDeleteChats: 'data:delete-chats',
  dataErase: 'data:erase',
  chatStart: 'chat:start',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event',
  chatNotice: 'chat:notice',
  chatPlace: 'chat:place',
  voiceCheck: 'voice:check',
  voiceSpeak: 'voice:speak',
  voiceSample: 'voice:sample',
  voiceCancel: 'voice:cancel',
  updatesStatus: 'updates:status',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  updatesEvent: 'updates:event',
} as const

/**
 * Address scheme the UI uses to show the pictures the app keeps:
 *   card://portrait/<character id>   a card's picture
 *   card://background/<version>      the user's own chat background
 *   card://scenario/<scenario id>    the picture of a ready-to-play scenario
 *   card://author/<author id>        the picture of a partner author
 *   card://web/<https address>       a picture or a sound a message brings from the web (fetched by the main process)
 */
export const PORTRAIT_SCHEME = 'card'
