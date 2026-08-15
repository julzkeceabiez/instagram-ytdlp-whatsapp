'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const ytdlp = require('./yt-dlp')

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024
const ALLOWED_QUALITIES = new Set([144, 240, 360, 480, 720, 1080, 1440, 2160])
const POST_PATH_RE = /^\/post\/[^/]+/i

function isYouTubeUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['https:', 'http:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    if (!YOUTUBE_HOSTS.has(host)) return false
    if (host === 'youtu.be') return url.pathname.length > 1
    return Boolean(
      url.searchParams.get('v') ||
      url.searchParams.get('list') ||
      POST_PATH_RE.test(url.pathname) ||
      /^\/(shorts|live|embed|watch|clip|playlist|channel|c|user|@[^/]+)\b/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

function isYouTubePostUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname.toLowerCase()) && POST_PATH_RE.test(url.pathname)
  } catch {
    return false
  }
}

function cleanYouTubeUrl(value) {
  const input = String(value || '').trim()
  if (!isYouTubeUrl(input)) {
    const error = new TypeError('URL harus berupa URL YouTube yang valid')
    error.code = 'INVALID_YOUTUBE_URL'
    throw error
  }
  return input
}

function normalizeError(error) {
  if (error?.code === 'YTDLP_START_FAILED') return new Error('yt-dlp belum terpasang atau tidak ditemukan di PATH server')
  if (error?.code === 'YTDLP_TIMEOUT') return new Error('Download YouTube timeout. Coba lagi dengan media yang lebih kecil')
  if (error?.code === 'YTDLP_FILE_TOO_LARGE') return new Error('Ukuran media melebihi batas pengiriman bot')
  const message = String(error?.message || error)
  if (/login required|sign in|private video|members-only|cookies/i.test(message)) {
    return new Error('Video membutuhkan akses/login yang sah atau cookies sudah kedaluwarsa')
  }
  if (/age.?restricted|confirm your age/i.test(message)) {
    return new Error('Video memiliki pembatasan usia dan membutuhkan cookies yang sah')
  }
  return new Error(`Download YouTube gagal: ${message.slice(-500)}`)
}

async function createRequestDir(root) {
  const directory = path.resolve(root)
  await fs.mkdir(directory, { recursive: true })
  return fs.mkdtemp(path.join(directory, 'request-'))
}

async function resolveCookiesPath(options = {}) {
  const candidate = options.cookies || process.env.YTDLP_COOKIES || path.join(process.cwd(), 'library', 'cookies.txt')
  try {
    const stat = await fs.stat(path.resolve(candidate))
    if (!stat.isFile()) return undefined
    return path.resolve(candidate)
  } catch {
    return undefined
  }
}

function normalizeQuality(value) {
  if (value === undefined || value === null || value === '') return 'best'
  const normalized = String(value).toLowerCase()
  if (['best', 'max', 'highest', 'worst', 'low'].includes(normalized)) return normalized
  const quality = Number(value)
  return Number.isFinite(quality) && quality > 0 ? Math.floor(quality) : 'best'
}

function cookieHeaderFromNetscape(content) {
  return String(content || '').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('\t')).filter(parts => parts.length >= 7).map(parts => `${parts[5]}=${parts[6]}`).join('; ')
}

function extractPostMediaUrls(html) {
  const decoded = String(html || '').replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\\//g, '/')
  const matches = decoded.match(/https?:\/\/[^"'<>\s]+/g) || []
  const candidates = matches.map(value => value.replace(/[),.]+$/, '')).filter(value => /(?:yt3\.ggpht\.com|yt3\.googleusercontent\.com)/i.test(value) && /=[sw](?:[6-9]\d{2}|[1-9]\d{3})/i.test(value))
  const bestByAsset = new Map()
  for (const value of candidates) {
    const sizeMatch = value.match(/=[sw](\d{3,})/i)
    const size = sizeMatch ? Number(sizeMatch[1]) : 0
    const key = value.replace(/=[sw]\d{3,}[^?]*/i, '').split('?')[0]
    const current = bestByAsset.get(key)
    if (!current || size > current.size) bestByAsset.set(key, { value, size })
  }
  return [...bestByAsset.values()].sort((a, b) => b.size - a.size).map(item => item.value)
}

async function downloadYouTubePost(input, options = {}) {
  if (!isYouTubePostUrl(input)) {
    const error = new TypeError('URL harus berupa URL YouTube Community Post yang valid')
    error.code = 'INVALID_YOUTUBE_POST_URL'
    throw error
  }
  const url = String(input).trim()
  const root = options.outputRoot || process.env.YOUTUBE_TMP_DIR || path.join(process.cwd(), 'tmp', 'youtube')
  const outputDir = await createRequestDir(root)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 120000)
  try {
    let headers = { 'user-agent': options.userAgent || 'Mozilla/5.0' }
    const cookies = await resolveCookiesPath(options)
    if (cookies) headers.cookie = cookieHeaderFromNetscape(await fs.readFile(cookies, 'utf8'))
    const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`Community Post HTTP ${response.status}`)
    const html = await response.text()
    const mediaUrls = extractPostMediaUrls(html)
    if (!mediaUrls.length) throw new Error('Media Community Post tidak ditemukan; post mungkin membutuhkan login atau berubah format')
    const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES)
    const files = []
    for (const [index, mediaUrl] of mediaUrls.slice(0, options.maxItems || 10).entries()) {
      const mediaResponse = await fetch(mediaUrl, { headers, signal: controller.signal, redirect: 'follow' })
      if (!mediaResponse.ok) continue
      const buffer = Buffer.from(await mediaResponse.arrayBuffer())
      if (buffer.length > maxBytes) throw Object.assign(new Error(`File melebihi batas ${maxBytes} bytes`), { code: 'YTDLP_FILE_TOO_LARGE' })
      const type = mediaResponse.headers.get('content-type') || 'image/jpeg'
      const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
      const file = path.join(outputDir, `post-${index + 1}.${extension}`)
      await fs.writeFile(file, buffer)
      files.push({ path: file, size: buffer.length, mediaUrl })
    }
    if (!files.length) throw new Error('Media Community Post gagal diunduh')
    return { path: files[0].path, size: files[0].size, files, mode: 'photo', sourceUrl: url, title: 'YouTube Community Post', id: url.split('/post/')[1]?.split(/[?/#]/)[0], filename: path.basename(files[0].path), cleanup: async () => fs.rm(outputDir, { recursive: true, force: true }) }
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
    if (error?.name === 'AbortError') error = Object.assign(new Error('Download Community Post timeout'), { code: 'YTDLP_TIMEOUT' })
    throw normalizeError(error)
  } finally {
    clearTimeout(timer)
  }
}

async function downloadYouTube(input, options = {}) {
  const url = cleanYouTubeUrl(input)
  if (isYouTubePostUrl(url)) return downloadYouTubePost(url, options)
  const mode = options.mode === 'audio' || options.audio ? 'audio' : 'video'
  const quality = normalizeQuality(options.quality)
  const root = options.outputRoot || process.env.YOUTUBE_TMP_DIR || path.join(process.cwd(), 'tmp', 'youtube')
  const outputDir = await createRequestDir(root)
  const maxBytes = Number(options.maxBytes || process.env.YOUTUBE_MAX_BYTES || DEFAULT_MAX_BYTES)
  const cookies = await resolveCookiesPath(options)
  const resultOptions = {
    ...options,
    ...(cookies ? { cookies } : {}),
    outputDir,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs || Number(process.env.YOUTUBE_TIMEOUT_MS) || 180000,
    quality,
    format: options.format,
    playlist: Boolean(options.playlist),
    playlistItems: options.playlistItems,
    maxItems: options.maxItems || (options.playlist ? 20 : undefined),
    liveFromStart: Boolean(options.liveFromStart),
    container: 'mp4'
  }

  try {
    const result = mode === 'audio'
      ? await ytdlp.downloadAudio(url, { ...resultOptions, audioFormat: options.audioFormat || 'mp3' })
      : await ytdlp.downloadVideo(url, resultOptions)
    return {
      ...result,
      sourceUrl: url,
      mode,
      filename: path.basename(result.path),
      cleanup: async () => fs.rm(outputDir, { recursive: true, force: true })
    }
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
    throw normalizeError(error)
  }
}

module.exports = {
  YOUTUBE_HOSTS,
  DEFAULT_MAX_BYTES,
  ALLOWED_QUALITIES,
  isYouTubeUrl,
  isYouTubePostUrl,
  extractPostMediaUrls,
  downloadYouTubePost,
  normalizeQuality,
  cleanYouTubeUrl,
  resolveCookiesPath,
  downloadYouTube
}
