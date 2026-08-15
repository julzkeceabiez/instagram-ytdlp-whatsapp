'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { isInstagramUrl, cleanInstagramUrl, downloadInstagram, downloadInstagramMedia } = require('../scraper/instagram')
const { extractInstagramUrl, handleInstagramCase } = require('../case/instagram')
const { isYouTubeUrl, isYouTubePostUrl, extractPostMediaUrls, cleanYouTubeUrl, resolveCookiesPath, normalizeQuality, downloadYouTube } = require('../scraper/youtube')
const { chooseFormat } = require('../scraper/yt-dlp')
const { extractYouTubeUrl, extractQuality, handleYouTubeCase } = require('../case/youtube')
const { isTikTokUrl, cleanTikTokUrl, resolveTikTokCookies, detectTikTokMediaType, downloadTikTok } = require('../scraper/tiktok')
const { extractTikTokUrl, handleTikTokCase } = require('../case/tiktok')

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
  assert.equal(isYouTubeUrl('https://www.youtube.com/live/abc123'), true)
  assert.equal(isYouTubeUrl('https://www.youtube.com/clip/abc123'), true)
  assert.equal(isYouTubeUrl('https://www.youtube.com/playlist?list=abc123'), true)
  assert.equal(isYouTubeUrl('https://music.youtube.com/watch?v=abc123'), true)
  assert.equal(isYouTubeUrl('https://www.youtube.com/@creator'), true)
  assert.equal(isYouTubeUrl('https://youtube.com/post/UgkxExample'), true)
  assert.equal(isYouTubePostUrl('https://youtube.com/post/UgkxExample'), true)
  assert.equal(isYouTubeUrl('https://example.com/watch?v=abc123'), false)
  assert.throws(() => cleanYouTubeUrl('https://example.com/watch?v=abc123'), { code: 'INVALID_YOUTUBE_URL' })
})

test('mengekstrak media Community Post dari HTML tanpa kompresi', () => {
  const html = '<img src="https://yt3.ggpht.com/example=s640-c-k-c0x00ffffff-no-rj.jpg"><img src="https://yt3.ggpht.com/second=w1280.webp">'
  const urls = extractPostMediaUrls(html)
  assert.equal(urls.length, 2)
  assert.match(urls[0], /yt3\.ggpht\.com/)
})

test('mengekstrak URL YouTube dan pilihan kualitas', () => {
  assert.equal(extractYouTubeUrl('ambil https://youtu.be/abc123 sekarang'), 'https://youtu.be/abc123')
  assert.equal(extractYouTubeUrl('tidak ada url'), '')
  assert.equal(extractQuality('720p https://youtu.be/abc123'), 720)
  assert.equal(extractQuality('https://youtu.be/abc123 1080'), 1080)
  assert.equal(normalizeQuality(720), 720)
  assert.equal(normalizeQuality(999), 999)
})

test('memilih format dinamis untuk best, worst, dan kualitas numerik', () => {
  assert.match(chooseFormat('video', { quality: 'best' }), /bv\*/)
  assert.match(chooseFormat('video', { quality: 'worst' }), /wv\*/)
  assert.match(chooseFormat('video', { quality: 720 }), /height<=720/)
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

test('download all playlist mengembalikan beberapa file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-playlist-test-'))
  const result = await downloadYouTube('https://www.youtube.com/playlist?list=FIXTURE', { binary: fixture, outputRoot: root, timeoutMs: 5000, maxBytes: 1024 * 1024, playlist: true, maxItems: 3 })
  assert.equal(result.files.length, 3)
  await result.cleanup()
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

test('mendeteksi video, foto, foto live, dan live video TikTok', () => {
  assert.equal(detectTikTokMediaType({ duration: 12, ext: 'mp4' }), 'video')
  assert.equal(detectTikTokMediaType({ duration: 0, ext: 'jpg', thumbnails: [{}] }), 'photo')
  assert.equal(detectTikTokMediaType({ media_type: 'live_photo', duration: 0 }), 'live_photo')
  assert.equal(detectTikTokMediaType({ is_live: true, duration: 0 }), 'live_video')
})

test('menerima URL TikTok valid dan menolak domain asing', () => {
  assert.equal(isTikTokUrl('https://www.tiktok.com/@creator/video/123456789'), true)
  assert.equal(isTikTokUrl('https://vm.tiktok.com/ZMexample/'), true)
  assert.equal(isTikTokUrl('https://example.com/video/123'), false)
  assert.throws(() => cleanTikTokUrl('https://example.com/video/123'), { code: 'INVALID_TIKTOK_URL' })
})

test('mengekstrak URL TikTok dan menemukan cookies/cookiestt.txt lokal', async () => {
  assert.equal(extractTikTokUrl('ambil https://www.tiktok.com/@creator/video/123 sekarang'), 'https://www.tiktok.com/@creator/video/123')
  const cookiesDir = path.join(process.cwd(), 'cookies')
  const cookiePath = path.join(cookiesDir, 'cookiestt.txt')
  await fs.mkdir(cookiesDir, { recursive: true })
  await fs.writeFile(cookiePath, '# Netscape HTTP Cookie File\n# fixture only\n')
  try {
    assert.equal(await resolveTikTokCookies(), path.resolve(cookiePath))
  } finally {
    await fs.rm(cookiePath, { force: true })
    await fs.rm(cookiesDir, { recursive: true, force: true })
  }
})

test('mengunduh video dan audio TikTok memakai fixture yt-dlp', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tt-test-'))
  for (const mode of ['video', 'audio']) {
    const result = await downloadTikTok('https://www.tiktok.com/@creator/video/123456789', { binary: fixture, outputRoot: root, timeoutMs: 5000, maxBytes: 1024 * 1024, mode })
    assert.equal(result.mode, mode)
    assert.equal(result.size > 0, true)
    await result.cleanup()
  }
  await fs.rm(root, { recursive: true, force: true })
})

test('case TikTok mengikuti gate, limit, reaction, dan mengirim video/audio', async () => {
  const sent = []
  const alip = { sendMessage: async (...args) => sent.push(args) }
  const originalBin = process.env.YTDLP_BIN
  process.env.YTDLP_BIN = fixture
  const reactions = []
  try {
    const video = await handleTikTokCase({
      alip,
      m: { chat: '12345@s.whatsapp.net', sender: 'user@s.whatsapp.net', key: { id: 'k1' } },
      text: 'https://www.tiktok.com/@creator/video/123456789',
      mode: 'video',
      autoDetect: false,
      isRegistered: () => true,
      checkLimit: () => false,
      addLimit: () => reactions.push('limit'),
      Reply: async text => reactions.push(text)
    })
    const audio = await handleTikTokCase({
      alip,
      m: { chat: '12345@s.whatsapp.net', sender: 'user@s.whatsapp.net', key: { id: 'k2' } },
      text: 'https://www.tiktok.com/@creator/video/123456789',
      command: 'ttmp3',
      mode: 'audio',
      autoDetect: false,
      isRegistered: () => true,
      checkLimit: () => false,
      addLimit: () => reactions.push('limit'),
      Reply: async text => reactions.push(text)
    })
    assert.equal(video.ok, true)
    assert.equal(audio.ok, true)
    assert.equal(sent.filter(item => item[1]?.video).length, 1)
    assert.equal(sent.filter(item => item[1]?.audio).length, 1)
    assert.equal(reactions.includes('limit'), true)
  } finally {
    if (originalBin === undefined) delete process.env.YTDLP_BIN
    else process.env.YTDLP_BIN = originalBin
  }
})
