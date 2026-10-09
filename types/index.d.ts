export type Queue = {
  eligible: number
  labeled: number
  ready: number
  inProgress: { count: number; title: string | null }
  error: string | null
}

// The task this session claimed (br update <id> --claim / --status in_progress).
export type Focus = {
  id: string
  claimedAt: number
  title: string | null
  priority: number | null
  type: string | null
  repo: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'beads-band': { queue: Queue | null; isHidden: boolean; focus: Focus | null }
  }
}
