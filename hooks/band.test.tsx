import { expect, mock, test } from 'claude-code/testing'

const RUN = (args: string) => ({ command: 'beads-band', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })
const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

const ITEMS = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` })))

const OUTPUTS: Record<string, string> = {
  'br ready --label autonomy:safe --json': ITEMS(2),
  'br list --label autonomy:safe --status open --json': ITEMS(10),
  'br ready --json': ITEMS(20),
  'br list --status in_progress --json': JSON.stringify([{ id: 'v1', title: 'PERIGEE v3' }, { id: 'v2', title: 'webapp' }]),
}

test('summarises the queue from br and routine-queue, on every surface', async ($, on) => {
  mock.clock(on)
  on('process.run', async (_$, e) => {
    const stdout = OUTPUTS[e.argv.join(' ')]
    return ok(stdout ?? '', stdout ? 0 : 1)
  })

  const { text } = await $.command.run(RUN(''))
  expect(text).toBe('queue 2 eligible (target 10–25, 10 labeled) · 20 ready · doing: PERIGEE v3 +1 more')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'beads-band', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 120 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /◆ beads/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' 2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/10–25' })).toBeDefined()
  }
})

test('shows an error instead of crashing when br fails', async ($, on) => {
  mock.clock(on)
  on('process.run', async () => ok('', 127))
  const { text } = await $.command.run(RUN(''))
  expect(text).toMatch(/^beads: /)
})

test('hide removes the band', async ($, on) => {
  mock.clock(on)
  on('process.run', async (_$, e) => ok(OUTPUTS[e.argv.join(' ')] ?? '[]'))
  // Stands in for the engine's own (empty) band beneath the plugin.
  on('ui.render', async ($$, e) => { const { Box } = $$.ui.resolve(e); return <Box /> })
  await $.command.run(RUN(''))
  await $.command.run(RUN('hide'))
  const ui = await $.ui.mount({
    plugin: 'beads-band', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 120 } as never,
  })
  expect(await ui.find({ type: 'Text', text: /queue/ })).toBeUndefined()
})

test('userConfig sets the dir, queue command and target', { options: { beadsDir: '/tmp/other-repo', queueCommand: 'uv run scripts/routine-queue.py --format json', targetMin: 5, targetMax: 15 } }, async ($, on) => {
  mock.clock(on)
  const cwds = new Set<string | undefined>()
  const argvs: string[] = []
  on('process.run', async (_$, e) => {
    cwds.add(e.init?.cwd); argvs.push(e.argv.join(' '))
    return ok(e.argv[0] === 'uv' ? ITEMS(7) : OUTPUTS[e.argv.join(' ')] ?? '[]')
  })
  const { text } = await $.command.run(RUN(''))
  expect(text).toMatch(/^queue 7 eligible \(target 5–15, 10 labeled\)/)
  expect(argvs).toContain('uv run scripts/routine-queue.py --format json')
  expect(argvs).not.toContain('br ready --label autonomy:safe --json')
  expect([...cwds]).toEqual(['/tmp/other-repo'])
})

test('claiming a task in this session switches the band to it; closing switches back', async ($, on) => {
  mock.clock(on)
  on('process.run', async (_$, e) => {
    if (e.argv[1] === 'show') {
      return ok(JSON.stringify([{ id: 'proj-abc1', title: 'webapp: prove one raster sketch', priority: 2, issue_type: 'task', labels: ['repo:webapp'] }]))
    }
    return ok(OUTPUTS[e.argv.join(' ')] ?? '[]')
  })
  on('tool.call', async () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  on('ui.render', async ($$, e) => { const { Box } = $$.ui.resolve(e); return <Box /> })

  const mount = () => $.ui.mount({
    plugin: 'beads-band', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 160 } as never,
  })

  await $.command.run(RUN(''))
  let ui = await mount()
  expect(await ui.find({ type: 'Text', text: /◆ beads/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /proj-abc1/ })).toBeUndefined()

  await $.tool.call({ tool: 'Bash', command: 'cd ~/src/project && br update proj-abc1 --status=in_progress' })
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /^proj-abc1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /webapp: prove one raster sketch/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /P2 · task · webapp · claimed/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'br close proj-abc1 --reason="done"' })
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /^proj-abc1/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /◆ beads/ })).toBeDefined()
})
