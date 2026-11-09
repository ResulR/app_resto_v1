import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupTriggers.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exports = {}

new Function('exports', compiled)(exports)

const {
  BackupTriggers,
  BACKUP_CHECK_INTERVAL_MS,
} = exports

function setup(run = async () => {}) {
  const events = new EventTarget()
  const visibility = new EventTarget()

  visibility.visibilityState = 'visible'

  let timerCallback = null
  let timerDelay = null
  let clearCount = 0
  let setCount = 0
  let calls = 0

  const triggers = new BackupTriggers({
    run: async () => {
      calls++
      await run()
    },
    events,
    visibility,
    setTimer(callback, delay) {
      setCount++
      timerCallback = callback
      timerDelay = delay
      return 123
    },
    clearTimer() {
      clearCount++
      timerCallback = null
    },
  })

  return {
    triggers,
    events,
    visibility,
    fireTimer() {
      timerCallback?.()
    },
    get calls() {
      return calls
    },
    get setCount() {
      return setCount
    },
    get clearCount() {
      return clearCount
    },
    get timerDelay() {
      return timerDelay
    },
  }
}

test('aucun déclenchement avant start', () => {
  const state = setup()

  state.events.dispatchEvent(new Event('online'))
  state.fireTimer()

  assert.equal(state.calls, 0)
  assert.equal(state.triggers.isStarted, false)
})

test('vérification au démarrage', () => {
  const state = setup()

  state.triggers.start()

  assert.equal(state.calls, 1)
  assert.equal(state.triggers.isStarted, true)

  state.triggers.stop()
})

test('événement online', () => {
  const state = setup()
  state.triggers.start()

  state.events.dispatchEvent(new Event('online'))

  assert.equal(state.calls, 2)

  state.triggers.stop()
})

test('retour de visibilité', () => {
  const state = setup()
  state.triggers.start()

  state.visibility.visibilityState = 'hidden'
  state.visibility.dispatchEvent(
    new Event('visibilitychange'),
  )

  assert.equal(state.calls, 1)

  state.visibility.visibilityState = 'visible'
  state.visibility.dispatchEvent(
    new Event('visibilitychange'),
  )

  assert.equal(state.calls, 2)

  state.triggers.stop()
})

test('vérification périodique', () => {
  const state = setup()
  state.triggers.start()

  assert.equal(
    state.timerDelay,
    BACKUP_CHECK_INTERVAL_MS,
  )

  state.fireTimer()

  assert.equal(state.calls, 2)

  state.triggers.stop()
})

test('start répété ne duplique pas les écouteurs', () => {
  const state = setup()

  state.triggers.start()
  state.triggers.start()

  assert.equal(state.setCount, 1)
  assert.equal(state.calls, 1)

  state.events.dispatchEvent(new Event('online'))

  assert.equal(state.calls, 2)

  state.triggers.stop()
})

test('stop supprime les déclenchements', () => {
  const state = setup()

  state.triggers.start()
  state.triggers.stop()

  state.events.dispatchEvent(new Event('online'))
  state.visibility.dispatchEvent(
    new Event('visibilitychange'),
  )
  state.fireTimer()

  assert.equal(state.calls, 1)
  assert.equal(state.clearCount, 1)
  assert.equal(state.triggers.isStarted, false)
})

test('redémarrage après stop', () => {
  const state = setup()

  state.triggers.start()
  state.triggers.stop()
  state.triggers.start()

  assert.equal(state.calls, 2)
  assert.equal(state.setCount, 2)

  state.triggers.stop()
})

test('une erreur asynchrone ne bloque pas les événements', async () => {
  const state = setup(async () => {
    throw new Error('Réseau indisponible')
  })

  state.triggers.start()

  await new Promise(resolve => setImmediate(resolve))

  state.events.dispatchEvent(new Event('online'))

  assert.equal(state.calls, 2)

  await new Promise(resolve => setImmediate(resolve))

  state.triggers.stop()
})

test('une erreur synchrone ne bloque pas le navigateur', () => {
  const events = new EventTarget()
  const visibility = new EventTarget()
  visibility.visibilityState = 'visible'

  const triggers = new BackupTriggers({
    run() {
      throw new Error('Erreur immédiate')
    },
    events,
    visibility,
    setTimer() {
      return 1
    },
    clearTimer() {},
  })

  assert.doesNotThrow(() => triggers.start())
  assert.doesNotThrow(() =>
    events.dispatchEvent(new Event('online')),
  )

  triggers.stop()
})
