export type GpuChoice = {
  /** The GPU theme this session shows, by its own choice, its folder's or the all-sessions one; absent, none. */
  applied?: string
  /** Whose choice `applied` is: this session's own, its folder's, or the one every session follows. */
  scope?: 'session' | 'folder' | 'all'
  /** A theme shown for a look only, until it is applied or the look ends. */
  preview?: string
  /** The card shows above the prompt: the surface draws no placed rows. */
  cardInBand?: boolean
  /** The card was put away: its hooks pass until the command shows it again. */
  cardAway?: boolean
}

/**
 * What Claude is doing in this session, as Koi Pond shows it: the six values its shader takes from a mod. Each is
 * absent or 0 when nothing is happening.
 */
export type GpuActivity = {
  /** 1 while your turn runs. */
  busy?: number
  /** How many tool calls came in the last 20 seconds, as a level from 0 to 3. */
  pace?: number
  /** 1 while Claude waits for your answer: a question is open, or Claude's last reply ended with one. */
  waiting?: number
  /** 1 for 30 seconds after a file is written. */
  making?: number
  /** 1 after a tool call fails, until one succeeds or the turn ends. */
  trouble?: number
  /** How many helper agents are at work. */
  helpers?: number
}

declare module 'claude-code' {
  interface PluginState {
    'gpu-themes': { choice: Shaped<GpuChoice>; activity: Shaped<GpuActivity> }
  }
}
