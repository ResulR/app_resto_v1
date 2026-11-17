import assert from 'node:assert/strict'
import { test } from 'node:test'

import { printTicket } from './browserPrint.ts'

test('un ticket vide est refuse', () => {
  assert.throws(
    () => printTicket(' \n '),
    /Ticket vide/,
  )
})

test('une fenetre bloquee est signalee', () => {
  const oldWindow = globalThis.window

  globalThis.window = {
    open: () => null,
  }

  try {
    assert.throws(
      () => printTicket('TEST'),
      /bloquée/,
    )
  } finally {
    globalThis.window = oldWindow
  }
})

test('le texte est transmis sans injection HTML', () => {
  const oldWindow = globalThis.window

  const content = { textContent: '' }
  const calls = []
  let html = ''

  const document = {
    open() { calls.push('document.open') },
    write(value) { html = value },
    close() { calls.push('document.close') },
    getElementById(id) {
      assert.equal(id, 'ticket')
      return content
    },
  }

  globalThis.window = {
    open(url, target) {
      assert.equal(url, '')
      assert.equal(target, '_blank')

      return {
        document,
        focus() { calls.push('focus') },
        print() { calls.push('print') },
      }
    },
  }

  try {
    const payload = '<script>alert(1)</script>\nPANINI'

    printTicket(payload)

    assert.equal(content.textContent, payload)
    assert.doesNotMatch(html, /alert\(1\)/)
    assert.match(html, /80mm/)
    assert.deepEqual(calls, [
      'document.open',
      'document.close',
      'focus',
      'print',
    ])
  } finally {
    globalThis.window = oldWindow
  }
})

test('absence de conteneur : fenetre fermee', () => {
  const oldWindow = globalThis.window
  let closed = false

  globalThis.window = {
    open() {
      return {
        document: {
          open() {},
          write() {},
          close() {},
          getElementById() { return null },
        },
        close() { closed = true },
      }
    },
  }

  try {
    assert.throws(
      () => printTicket('TEST'),
      /Impossible de préparer/,
    )
    assert.equal(closed, true)
  } finally {
    globalThis.window = oldWindow
  }
})
