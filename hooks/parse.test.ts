import { expect, test } from 'claude-code/testing'

import { config, layout, parseBr } from './register'

test('parseBr reads claims and releases, ignores reads', async () => {
  expect(parseBr('br update proj-1 --status=in_progress')).toEqual([{ claim: 'proj-1' }])
  expect(parseBr('br update proj-1 -s in_progress')).toEqual([{ claim: 'proj-1' }])
  expect(parseBr('cd x && br update proj-2.3 --claim')).toEqual([{ claim: 'proj-2.3' }])
  expect(parseBr('br update proj-1 --status open')).toEqual([{ release: ['proj-1'] }])
  expect(parseBr('br close proj-1 proj-2 --reason="x"')).toEqual([{ release: ['proj-1', 'proj-2'] }])
  expect(parseBr('br update proj-1 --add-label autonomy:safe')).toEqual([])
  expect(parseBr('br show proj-1 && br ready')).toEqual([])
})

const Q = { eligible: 2, labeled: 10, ready: 20, inProgress: { count: 3, title: 'x' }, error: null }
const text = (lines: { text: string }[][]) => lines.map(l => l.map(p => p.text).join(''))

test('layout tiers the idle band by width and never exceeds one line', async () => {
  const cfg = config({})
  expect(text(layout(Q, null, cfg, 120, 0))).toEqual(['◆ beads  queue ▰▱▱▯▱▱▱▱▱▱ 2/10–25  ·  ready 20  ·  active 3  ·  labeled 10'])
  expect(text(layout(Q, null, cfg, 50, 0))).toEqual(['◆ beads  queue ▰▯▱▱▱▱ 2/10–25  ·  ready 20  ·  active 3'])
  expect(text(layout(Q, null, cfg, 38, 0))).toEqual(['◆ 2/10 queued  ·  ready 20'])
  expect(text(layout({ ...Q, eligible: 14 }, null, cfg, 120, 0))[0]).toContain('▰▰▰▰▰▰▱▱▱▱ 14/10–25')
})

test('layout shows the claimed task over two lines', async () => {
  const cfg = config({})
  const f = { id: 'proj-1', claimedAt: 0, title: 'Do the thing', priority: 1, type: 'task', repo: 'webapp' }
  expect(text(layout(Q, f, cfg, 120, 12 * 60_000))).toEqual([
    '▶ proj-1  Do the thing',
    '  P1 · task · webapp · claimed 12m ago   │   queue 2  ·  ready 20',
  ])
  expect(text(layout(Q, f, cfg, 40, 0))[1]).toBe('  P1 · task · webapp · claimed just now')
})
