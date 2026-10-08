import { Hourglass, MapPin, Zap } from '@lucide/vue'
import type { Component } from 'vue'
import type { SceneDirection } from '@shared/types'

// The stage directions as the app shows them: buttons above the message box, and a
// small tag on the reply written under one. What the model is told for each is in
// src/core/prompt/direction.ts.

export interface DirectionChoice {
  id: SceneDirection
  /** On the button. */
  label: string
  /** On the reply written under it. */
  tag: string
  /** The button's tooltip. */
  hint: string
  icon: Component
}

export const SCENE_DIRECTIONS: readonly DirectionChoice[] = [
  { id: 'event', label: 'Something happens', tag: 'Something happens', hint: 'Something unexpected shakes up the scene', icon: Zap },
  { id: 'place', label: 'Somewhere else', tag: 'Somewhere else', hint: 'The scene moves to another place', icon: MapPin },
  { id: 'time', label: 'Later…', tag: 'Later', hint: 'Time passes: the scene picks up later', icon: Hourglass },
]

export function directionChoice(id: SceneDirection | undefined): DirectionChoice | null {
  return SCENE_DIRECTIONS.find((choice) => choice.id === id) ?? null
}
