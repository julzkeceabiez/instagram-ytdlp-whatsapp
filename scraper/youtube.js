'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const ytdlp = require('./yt-dlp')

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024
const ALLOWED_QUALITIES = new Set([144, 240, 360, 480, 720, 1080, 1440, 2160])

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
      /^\/(shorts|live|embed|watch|clip|playlist|channel|c|user|@[^/]+)\b/i.test(url.pathname)
    )
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

async function downloadYouTube(input, options = {}) {
  const url = cleanYouTubeUrl(input)
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
  normalizeQuality,
  cleanYouTubeUrl,
  resolveCookiesPath,
  downloadYouTube
}
