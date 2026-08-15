'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { isInstagramUrl, cleanInstagramUrl, downloadInstagram } = require('../scraper/instagram')
const { extractInstagramUrl, handleInstagramCase } = require('../case/instagram')

const fixture = path.join(__dirname, 'fake-yt-dlp.js')

test('menerima URL Instagram dan menolak domain asing', () => {
  assert.equal(isInstagramUrl('https://www.instagram.com/reel/ABC123/'), true)
  assert.equal(isInstagramUrl('https://instagram.com/p/ABC123/'), true)
  assert.equal(isInstagramUrl('https://example.com/file'), false)
  assert.throws(() => cleanInstagramUrl('https://example.com/file'), { code: 'INVALID_INSTAGRAM_URL' })
})

test('mengekstrak URL dari argumen command', () => {
  assert.equal(extractInstagramUrl('tolong https://www.instagram.com/reel/ABC123/ sekarang'), 'https://www.instagram.com/reel/ABC123/')
  assert.equal(extractInstagramUrl('tidak ada url'), '')
})

test('mengunduh memakai fixture yt-dlp dan membersihkan direktori request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-test-'))
  const result = await downloadInstagram('https://www.instagram.com/reel/ABC123/', {
    binary: fixture,
    outputRoot: root,
    timeoutMs: 5000,
    maxBytes: 1024 * 1024
  })
  assert.equal(result.id, 'fixture123')
  assert.equal(result.size > 0, true)
  await fs.access(result.path)
  await result.cleanup()
  await assert.rejects(fs.access(path.dirname(result.path)))
  await fs.rm(root, { recursive: true, force: true })
})

test('case mengirim status dan media melalui mock WhatsApp', async () => {
  const sent = []
  const alip = { sendMessage: async (...args) => sent.push(args) }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-case-'))
  const original = process.env.INSTAGRAM_TMP_DIR
  process.env.INSTAGRAM_TMP_DIR = root
  // Binary fixture dikonfigurasi melalui YTDLP_BIN agar handler tetap sama dengan produksi.
  const originalBin = process.env.YTDLP_BIN
  process.env.YTDLP_BIN = fixture
  try {
    const result = await handleInstagramCase({
      alip,
      m: { chat: '12345@s.whatsapp.net' },
      text: 'https://www.instagram.com/reel/ABC123/',
      prefix: '.',
      command: 'ig'
    })
    assert.equal(result.ok, true)
    assert.equal(sent.length, 2)
    assert.match(sent[0][1].text, /mengunduh/i)
    assert.equal(Buffer.isBuffer(sent[1][1].video), true)
  } finally {
    if (original === undefined) delete process.env.INSTAGRAM_TMP_DIR
    else process.env.INSTAGRAM_TMP_DIR = original
    if (originalBin === undefined) delete process.env.YTDLP_BIN
    else process.env.YTDLP_BIN = originalBin
    await fs.rm(root, { recursive: true, force: true })
  }
})
