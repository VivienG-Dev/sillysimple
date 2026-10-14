import { activePersona, DEFAULT_SETTINGS } from '@shared/defaults'
import type { Persona, Settings, SettingsPatch } from '@shared/types'

// The settings are owned by the main process (it saves them to disk).
// This store keeps a copy for the UI and sends every change back.

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(toPlain(DEFAULT_SETTINGS))

  const onboardingDone = computed(() => settings.value.onboardingDone)
  const connection = computed(() => settings.value.connection)
  const generation = computed(() => settings.value.generation)
  const appearance = computed(() => settings.value.appearance)
  /** "Adapts to you": the two beta options, and the user's tastes. */
  const adapt = computed(() => settings.value.adapt)
  /** Replies read aloud: the voice service and how it is used. */
  const voice = computed(() => settings.value.voice)
  /** Whether the app looks for a new version of itself. */
  const updates = computed(() => settings.value.updates)
  const personas = computed(() => settings.value.personas)
  /** The persona in use: who the user is in the chats right now. */
  const persona = computed(() => activePersona(settings.value))

  async function load(): Promise<void> {
    settings.value = await window.api.settings.get()
  }

  async function update(patch: SettingsPatch): Promise<void> {
    settings.value = await window.api.settings.update(toPlain(patch))
  }

  // --- The user's own chat background ----------------------------------------------

  /** Keeps a picture the user picked as their chat background, and turns it on. */
  async function setBackground(file: File): Promise<void> {
    settings.value = await window.api.settings.setBackground(await pictureToBackground(file))
  }

  async function removeBackground(): Promise<void> {
    settings.value = await window.api.settings.removeBackground()
  }

  // --- Personas ------------------------------------------------------------------

  /** Changes the name or the description of the persona in use. */
  async function updatePersona(changes: Partial<Omit<Persona, 'id'>>): Promise<void> {
    const id = persona.value.id
    await update({ personas: personas.value.map((item) => (item.id === id ? { ...item, ...changes } : item)) })
  }

  /** Adds a persona and switches to it. */
  async function addPersona(name: string): Promise<void> {
    const added: Persona = { id: crypto.randomUUID(), name, description: '' }
    await update({ personas: [...personas.value, added], activePersonaId: added.id })
  }

  async function selectPersona(id: string): Promise<void> {
    await update({ activePersonaId: id })
  }

  /** Removes a persona. The last one cannot be removed: the user is always someone. */
  async function removePersona(id: string): Promise<void> {
    if (personas.value.length < 2) return
    await update({ personas: personas.value.filter((item) => item.id !== id) })
  }

  return {
    settings,
    onboardingDone,
    connection,
    generation,
    appearance,
    adapt,
    voice,
    updates,
    personas,
    persona,
    load,
    update,
    setBackground,
    removeBackground,
    updatePersona,
    addPersona,
    selectPersona,
    removePersona,
  }
})
