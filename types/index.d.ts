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

declare module 'claude-code' {
  interface PluginState {
    'gpu-themes': { choice: Shaped<GpuChoice> }
  }
}
