'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { isInstagramUrl, cleanInstagramUrl, downloadInstagram, downloadInstagramMedia } = require('../scraper/instagram')
const { extractInstagramUrl, handleInstagramCase } = require('../case/instagram')
const { isYouTubeUrl, cleanYouTubeUrl, resolveCookiesPath, normalizeQuality, downloadYouTube } = require('../scraper/youtube')
const { extractYouTubeUrl, extractQuality, handleYouTubeCase } = require('../case/youtube')

const fixture = path.join(__dirname, 'fake-yt-dlp.js')

test('menerima URL Instagram dan menolak domain asing', () => {
  assert.equal(isInstagramUrl('https://www.instagram.com/reel/ABC123/'), true)
  assert.equal(isInstagramUrl('https://instagram.com/p/ABC123/'), true)
  assert.equal(isInstagramUrl('https://example.com/file'), false)
  assert.throws(() => cleanInstagramUrl('https://example.com/file'), { code: 'INVALID_INSTAGRAM_URL' })
})

test('mengekstrak URL Instagram dari command', () => {
  assert.equal(extractInstagramUrl('tolong https://www.instagram.com/reel/ABC123/ sekarang'), 'https://www.instagram.com/reel/ABC123/')
  assert.equal(extractInstagramUrl('tidak ada url'), '')
})

test('mengunduh Instagram dalam mode video dan foto', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-media-test-'))
  for (const mode of ['video', 'photo']) {
    const result = await downloadInstagramMedia('https://www.instagram.com/reel/ABC123/', { binary: fixture, outputRoot: root, timeoutMs: 5000, maxBytes: 1024 * 1024, mode })
    assert.equal(result.mode, mode)
    assert.equal(result.size > 0, true)
    await result.cleanup()
  }
  await fs.rm(root, { recursive: true, force: true })
})

test('mengunduh Instagram memakai fixture yt-dlp dan membersihkan direktori request', async () => {
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

test('case Instagram mengirim status dan media melalui mock WhatsApp', async () => {
  const sent = []
  const alip = { sendMessage: async (...args) => sent.push(args) }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-case-'))
  const original = process.env.INSTAGRAM_TMP_DIR
  const originalBin = process.env.YTDLP_BIN
  process.env.INSTAGRAM_TMP_DIR = root
  process.env.YTDLP_BIN = fixture
  try {
    const result = await handleInstagramCase({ alip, m: { chat: '12345@s.whatsapp.net' }, text: 'https://www.instagram.com/reel/ABC123/', prefix: '.', command: 'ig' })
    assert.equal(result.ok, true)
    assert.equal(sent.length, 2)
    assert.match(sent[0][1].text, /mengunduh/i)
    assert.equal(Buffer.isBuffer(sent[1][1].video), true)
    const photoSent = []
    const photoAlip = { sendMessage: async (...args) => photoSent.push(args) }
    const photo = await handleInstagramCase({ alip: photoAlip, m: { chat: '12345@s.whatsapp.net' }, text: 'https://www.instagram.com/p/ABC123/', mode: 'photo' })
    assert.equal(photo.ok, true)
    assert.equal(Buffer.isBuffer(photoSent[1][1].image), true)
  } finally {
    if (original === undefined) delete process.env.INSTAGRAM_TMP_DIR
    else process.env.INSTAGRAM_TMP_DIR = original
    if (originalBin === undefined) delete process.env.YTDLP_BIN
    else process.env.YTDLP_BIN = originalBin
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('menerima URL YouTube yang valid dan menolak domain asing', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abc123'), true)
  assert.equal(isYouTubeUrl('https://youtu.be/abc123'), true)
  assert.equal(isYouTubeUrl('https://www.youtube.com/shorts/abc123'), true)
  assert.equal(isYouTubeUrl('https://example.com/watch?v=abc123'), false)
  assert.throws(() => cleanYouTubeUrl('https://example.com/watch?v=abc123'), { code: 'INVALID_YOUTUBE_URL' })
})

test('mengekstrak URL YouTube dan pilihan kualitas', () => {
  assert.equal(extractYouTubeUrl('ambil https://youtu.be/abc123 sekarang'), 'https://youtu.be/abc123')
  assert.equal(extractYouTubeUrl('tidak ada url'), '')
  assert.equal(extractQuality('720p https://youtu.be/abc123'), 720)
  assert.equal(extractQuality('https://youtu.be/abc123 1080'), 1080)
  assert.equal(normalizeQuality(720), 720)
  assert.equal(normalizeQuality(999), undefined)
})

test('mendeteksi library/cookies.txt secara lokal tanpa membaca nilainya', async () => {
  const library = path.join(process.cwd(), 'library')
  const cookiePath = path.join(library, 'cookies.txt')
  await fs.mkdir(library, { recursive: true })
  await fs.writeFile(cookiePath, '# Netscape HTTP Cookie File\n# test fixture only\n')
  try {
    assert.equal(await resolveCookiesPath(), path.resolve(cookiePath))
  } finally {
    await fs.rm(cookiePath, { force: true })
    await fs.rm(library, { recursive: true, force: true })
  }
})

test('mengunduh video dan audio YouTube memakai fixture yt-dlp', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-test-'))
  for (const mode of ['video', 'audio']) {
    const result = await downloadYouTube('https://youtu.be/abc123', { binary: fixture, outputRoot: root, timeoutMs: 5000, maxBytes: 1024 * 1024, mode })
    assert.equal(result.mode, mode)
    assert.equal(result.size > 0, true)
    await fs.access(result.path)
    await result.cleanup()
  }
  await fs.rm(root, { recursive: true, force: true })
})

test('case YouTube mengirim video dan audio melalui mock WhatsApp', async () => {
  const sent = []
  const alip = { sendMessage: async (...args) => sent.push(args) }
  const originalBin = process.env.YTDLP_BIN
  process.env.YTDLP_BIN = fixture
  try {
    const video = await handleYouTubeCase({ alip, m: { chat: '12345@s.whatsapp.net' }, text: '720p https://youtu.be/abc123', mode: 'video' })
    const audio = await handleYouTubeCase({ alip, m: { chat: '12345@s.whatsapp.net' }, text: 'https://youtu.be/abc123', mode: 'audio' })
    assert.equal(video.ok, true)
    assert.equal(audio.ok, true)
    assert.equal(sent.length, 4)
    assert.equal(Buffer.isBuffer(sent[1][1].video), true)
    assert.equal(Buffer.isBuffer(sent[3][1].audio), true)
    assert.match(sent[0][1].text, /720p/i)
  } finally {
    if (originalBin === undefined) delete process.env.YTDLP_BIN
    else process.env.YTDLP_BIN = originalBin
  }
})
