import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Focus, Queue } from '../types'

const MIN_GAP_MS = 60 * 1000

// Values come from the manifest's userConfig (settings.json pluginConfigs);
// beadsDir empty means the session's own directory; queueCommand empty means
// the queue is `br ready` filtered to queueLabel.
export type Config = {
  beadsDir: string | undefined
  queueLabel: string
  queueCommand: string[] | null
  refreshMs: number
  targetMin: number
  targetMax: number
}

export function config(options: PluginOptions): Config {
  const dir = String(options.beadsDir ?? '').trim()
  const command = String(options.queueCommand ?? '').trim()
  return {
    beadsDir: dir || undefined,
    queueLabel: String(options.queueLabel ?? 'autonomy:safe'),
    queueCommand: command ? command.split(/\s+/) : null,
    refreshMs: Math.max(1, Number(options.refreshMinutes ?? 5)) * 60 * 1000,
    targetMin: Number(options.targetMin ?? 10),
    targetMax: Number(options.targetMax ?? 25),
  }
}

const queue = atom({ plugin: 'beads-band', key: 'queue' } as const, null)
const isHidden = atom({ plugin: 'beads-band', key: 'isHidden' } as const, false)
const focus = atom({ plugin: 'beads-band', key: 'focus' } as const, null)

function count(stdout: string): number {
  const parsed = JSON.parse(stdout)
  return Array.isArray(parsed) ? parsed.length : 0
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function describe(q: Queue, cfg: Config): string {
  if (q.error) return `beads: ${q.error}`
  const parts = [
    `queue ${q.eligible} eligible (target ${cfg.targetMin}–${cfg.targetMax}, ${q.labeled} labeled)`,
    `${q.ready} ready`,
  ]
  if (q.inProgress.title) {
    const more = q.inProgress.count > 1 ? ` +${q.inProgress.count - 1} more` : ''
    parts.push(`doing: ${clip(q.inProgress.title, 48)}${more}`)
  }
  return parts.join(' · ')
}

/** The queue in a few words for the status line, which every surface draws (the band may not be). */
export function statusText(q: Queue, cfg: Config): string {
  if (q.error) return 'beads: unavailable'
  return `queue ${q.eligible}/${cfg.targetMin}–${cfg.targetMax} · ${q.ready} ready`
}

/** Pins the queue to the status line, or clears it while the band is hidden. */
async function pinStatus($: EngineInterface, cfg: Config) {
  const q = await read($, queue)
  $.ui.status(q && !(await read($, isHidden)) ? statusText(q, cfg) : undefined)
}

// What one shell command does to this session's focus. The gate: a
// `br update <id>` carrying --claim, or -s/--status set to in_progress,
// claims <id>; `br close <ids>`, or `br update <id>` setting any other
// status, releases it. Anything else leaves the focus alone.
export type FocusChange = { claim: string } | { release: string[] } | null

export function parseBr(command: string): FocusChange[] {
  const changes: FocusChange[] = []
  for (const segment of command.split(/&&|\|\||;|\n/)) {
    const upd = segment.match(/\bbr\s+update\s+([A-Za-z0-9][\w.-]*)(.*)$/)
    if (upd) {
      const [, id, rest] = upd
      const status = rest.match(/(?:-s|--status)[\s=]+["']?([a-z_]+)/)
      if (/--claim\b/.test(rest) || status?.[1] === 'in_progress') changes.push({ claim: id })
      else if (status) changes.push({ release: [id] })
      continue
    }
    const close = segment.match(/\bbr\s+close\s+(.*)$/)
    if (close) {
      const ids = close[1].split(/\s+/).filter(word => /^[A-Za-z0-9][\w.-]*$/.test(word) && /\d/.test(word))
      if (ids.length) changes.push({ release: ids })
    }
  }
  return changes
}

export type Span = { text: string; color?: string; bold?: boolean }

function meterSpans(eligible: number, cfg: Config, cells: number): Span[] {
  const scale = (n: number) => Math.min(cells, Math.round((n / Math.max(1, cfg.targetMax)) * cells))
  const filled = eligible > 0 ? Math.max(1, scale(eligible)) : 0
  const threshold = Math.max(1, scale(cfg.targetMin))
  const color = eligible >= cfg.targetMin ? 'success' : 'claude'
  return Array.from({ length: cells }, (_, i) => (i < filled
    ? { text: '▰', color }
    : { text: i === threshold - 1 ? '▯' : '▱', color: 'subtle' }))
}

const SEP: Span = { text: '  ·  ', color: 'subtle' }

function stat(label: string, value: number): Span[] {
  return [{ text: `${label} `, color: 'inactive' }, { text: String(value), bold: true }]
}

// Width tiers: wide shows the 10-cell meter and every count; medium a
// 6-cell meter and the counts that matter; narrow just queue and ready.
export function layout(q: Queue | null, f: Focus | null, cfg: Config, width: number, now: number): Span[][] {
  const ok = q && !q.error
  const queueSpans = (cells: number): Span[] => (ok
    ? [{ text: 'queue ', color: 'inactive' }, ...meterSpans(q.eligible, cfg, cells),
       { text: ` ${q.eligible}`, bold: true }, { text: `/${cfg.targetMin}–${cfg.targetMax}`, color: 'inactive' }]
    : [])
  const statsSpans = (): Span[] => {
    if (!ok) return []
    if (width >= 72) return [...queueSpans(10), SEP, ...stat('ready', q.ready), SEP, ...stat('active', q.inProgress.count), SEP, ...stat('labeled', q.labeled)]
    if (width >= 44) return [...queueSpans(6), SEP, ...stat('ready', q.ready), SEP, ...stat('active', q.inProgress.count)]
    return [{ text: `${q.eligible}`, bold: true }, { text: `/${cfg.targetMin} queued`, color: 'inactive' }, SEP, ...stat('ready', q.ready)]
  }

  if (!f) return [[{ text: width >= 44 ? '◆ beads  ' : '◆ ', color: 'claude' }, ...statsSpans()]]

  const meta = [f.priority !== null ? `P${f.priority}` : null, f.type, f.repo, `claimed ${ago(now - f.claimedAt)}`]
    .filter(Boolean).join(' · ')
  const head: Span[] = [{ text: '▶ ', color: 'claude' }, { text: `${f.id}  `, color: 'suggestion' }, { text: f.title ?? 'loading…', bold: true }]
  const tail: Span[] = ok && width >= 72
    ? [{ text: '  ', color: 'inactive' }, { text: meta, color: 'inactive' }, { text: '   │   ', color: 'subtle' }, ...stat('queue', q.eligible), SEP, ...stat('ready', q.ready)]
    : [{ text: '  ', color: 'inactive' }, { text: meta, color: 'inactive' }]
  return [head, tail]
}

let lastRefresh = 0

async function refresh($: EngineInterface, cfg: Config) {
  lastRefresh = await $.clock.now()
  const run = (argv: string[]) => $.process.run(argv, { cwd: cfg.beadsDir, timeoutMs: 20_000 })
  try {
    const [eligible, labeled, ready, doing] = await Promise.all([
      run(cfg.queueCommand ?? ['br', 'ready', '--label', cfg.queueLabel, '--json']),
      run(['br', 'list', '--label', cfg.queueLabel, '--status', 'open', '--json']),
      run(['br', 'ready', '--json']),
      run(['br', 'list', '--status', 'in_progress', '--json']),
    ])
    const doingList = JSON.parse(doing.stdout) as { title: string }[]
    const next: Queue = {
      eligible: count(eligible.stdout),
      labeled: count(labeled.stdout),
      ready: count(ready.stdout),
      inProgress: { count: doingList.length, title: doingList[0]?.title ?? null },
      error: null,
    }
    await update($, queue, () => next)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, queue, () => ({
      eligible: 0, labeled: 0, ready: 0,
      inProgress: { count: 0, title: null },
      error: clip(message, 80),
    }))
  }
  await pinStatus($, cfg)
}

async function claim($: EngineInterface, cfg: Config, id: string) {
  const claimedAt = await $.clock.now()
  await update($, focus, () => ({ id, claimedAt, title: null, priority: null, type: null, repo: null }))
  try {
    const shown = await $.process.run(['br', 'show', id, '--json'], { cwd: cfg.beadsDir, timeoutMs: 20_000 })
    const parsed = JSON.parse(shown.stdout)
    const task = (Array.isArray(parsed) ? parsed[0] : parsed) as
      { title?: string; priority?: number; issue_type?: string; labels?: string[] } | undefined
    const repo = task?.labels?.find(label => label.startsWith('repo:'))?.slice(5) ?? null
    await update($, focus, f => (f?.id === id
      ? { ...f, title: task?.title ?? null, priority: task?.priority ?? null, type: task?.issue_type ?? null, repo }
      : f))
  } catch {
    // The id still shows; the details stay blank.
  }
}

function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 90) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

export const register: Register = (on, options) => {
  const cfg = config(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'beads-band', description: 'Refresh or toggle the beads queue band (args: hide | show)' })
    void refresh($, cfg)
    $.clock.every(cfg.refreshMs, () => refresh($, cfg))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const command = e.command
    const failed = Boolean(result.deny) || Boolean(result.isError)
    if (failed || !/\bbr\s+(update|close)\b/.test(command)) return result
    for (const change of parseBr(command)) {
      if (change && 'claim' in change) await claim($, cfg, change.claim)
      else if (change && 'release' in change) {
        await update($, focus, f => (f && change.release.includes(f.id) ? null : f))
      }
    }
    void refresh($, cfg)
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if ((await $.clock.now()) - lastRefresh > MIN_GAP_MS) void refresh($, cfg)
    return next(e)
  })

  on('command.run', { command: 'beads-band' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      await pinStatus($, cfg)
      return { text: `Beads band ${arg === 'hide' ? 'hidden' : 'shown'}.` }
    }
    await refresh($, cfg)
    const q = await read($, queue)
    return { text: q ? describe(q, cfg) : 'No queue data.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const q = await read($, queue)
    const f = await read($, focus)
    if (e.props.hasSurvey || (q === null && f === null) || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns ?? 80
    // One truncating Text per line, built from coloured spans, so a narrow
    // band clips instead of wrapping its pieces into columns.
    const line = (key: string, parts: Span[]) => (
      <Text key={key} wrap="truncate-end">
        {parts.map((part, i) => (
          <Text key={`${key}${i}`} color={part.color} bold={part.bold}>{part.text}</Text>
        ))}
      </Text>
    )

    // Other mods' bands stack under this one: hand on to the rest of the chain.
    const rest = await next(e)
    if (q?.error && !f) return <Box flexDirection="column"><Box key="beads">{line('err', [{ text: '◆ beads ', color: 'error' }, { text: q.error, color: 'inactive' }])}</Box>{rest ?? null}</Box>

    const now = await $.clock.now()
    const lines = layout(q, f, cfg, width, now)
    return <Box flexDirection="column">{lines.map((parts, i) => line(`l${i}`, parts))}{rest ?? null}</Box>
  })
}
