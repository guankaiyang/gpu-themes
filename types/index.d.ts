export type GpuChoice = {
  /** The GPU theme this session shows, by its own choice or the all-sessions one; absent, none. */
  applied?: string
  /** Whose choice `applied` is: this session's own, or the one every session follows. */
  scope?: 'session' | 'all'
  /** A theme shown for a look only, until it is applied or the look ends. */
  preview?: string
  /** The card shows above the prompt: the surface draws no placed rows. */
  cardInBand?: boolean
  /** The card was put away: its hooks pass until the command shows it again. */
  cardAway?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'gpu-themes': { choice: Shaped<GpuChoice> }
  }
}
