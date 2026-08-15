'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const ytdlp = require('./yt-dlp')

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024

function isTikTokUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    if (!TIKTOK_HOSTS.has(host)) return false
    return url.pathname.length > 1
  } catch {
    return false
  }
}

function cleanTikTokUrl(value) {
  const input = String(value || '').trim()
  if (!isTikTokUrl(input)) {
    const error = new TypeError('URL harus berupa URL TikTok yang valid')
    error.code = 'INVALID_TIKTOK_URL'
    throw error
  }
  return input
}

async function resolveTikTokCookies(options = {}) {
  const candidate = options.cookies || process.env.TIKTOK_COOKIES || path.join(process.cwd(), 'cookies', 'cookiestt.txt')
  try {
    const stat = await fs.stat(path.resolve(candidate))
    return stat.isFile() ? path.resolve(candidate) : undefined
  } catch {
    return undefined
  }
}

function detectTikTokMediaType(info = {}) {
  const serialized = JSON.stringify(info).toLowerCase()
  if (info.live_photo === true || info.is_live_photo === true || info.media_type === 'live_photo' || /live[_ -]?photo/.test(serialized)) return 'live_photo'
  const duration = Number(info.duration)
  const hasPhotoSignals = info.ext === 'jpg' || info.ext === 'jpeg' || info.ext === 'png' || (Array.isArray(info.thumbnails) && info.thumbnails.length > 0)
  if (duration === 0 && hasPhotoSignals) return 'photo'
  if (info.live_status === 'is_live' || info.is_live === true) return 'live_video'
  return 'video'
}

function normalizeError(error) {
  if (error?.code === 'YTDLP_START_FAILED') return new Error('yt-dlp belum terpasang atau tidak ditemukan di PATH server')
  if (error?.code === 'YTDLP_TIMEOUT') return new Error('Download TikTok timeout. Coba lagi dengan media yang lebih kecil')
  if (error?.code === 'YTDLP_FILE_TOO_LARGE') return new Error('Ukuran media TikTok melebihi batas pengiriman bot')
  const message = String(error?.message || error)
  if (/login required|sign in|private|cookies|captcha/i.test(message)) return new Error('TikTok membutuhkan akses yang sah atau cookies sudah kedaluwarsa')
  return new Error(`Download TikTok gagal: ${message.slice(-500)}`)
}

async function createRequestDir(root) {
  const directory = path.resolve(root)
  await fs.mkdir(directory, { recursive: true })
  return fs.mkdtemp(path.join(directory, 'request-'))
}

async function downloadTikTok(input, options = {}) {
  const url = cleanTikTokUrl(input)
  const requestedMode = options.mode === 'audio' || options.audio ? 'audio' : options.mode === 'photo' ? 'photo' : 'video'
  const root = options.outputRoot || process.env.TIKTOK_TMP_DIR || path.join(process.cwd(), 'tmp', 'tiktok')
  const outputDir = await createRequestDir(root)
  const cookies = await resolveTikTokCookies(options)
  const maxBytes = Number(options.maxBytes || process.env.TIKTOK_MAX_BYTES || DEFAULT_MAX_BYTES)
  const common = {
    ...options,
    ...(cookies ? { cookies } : {}),
    outputDir,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs || Number(process.env.TIKTOK_TIMEOUT_MS) || 180000,
    format: options.format,
    container: options.container || 'mp4'
  }

  try {
    let info
    let detectedType = requestedMode
    if (options.autoDetect && requestedMode === 'video') {
      info = await ytdlp.getInfo(url, common)
      detectedType = detectTikTokMediaType(info)
    }
    const mode = detectedType === 'photo' || detectedType === 'live_photo' ? 'photo' : requestedMode
    const result = mode === 'audio'
      ? await ytdlp.downloadAudio(url, { ...common, audioFormat: options.audioFormat || 'mp3' })
      : mode === 'photo'
        ? await ytdlp.downloadPhoto(url, common)
        : await ytdlp.downloadVideo(url, common)
    return {
      ...result,
      sourceUrl: url,
      mode,
      mediaType: detectedType,
      detected: Boolean(options.autoDetect),
      info: result.info || info,
      filename: path.basename(result.path),
      cookiesPath: cookies,
      cleanup: async () => fs.rm(outputDir, { recursive: true, force: true })
    }
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
    throw normalizeError(error)
  }
}

async function downloadTikTokVideo(url, options = {}) {
  return downloadTikTok(url, { ...options, mode: 'video' })
}

async function downloadTikTokAudio(url, options = {}) {
  return downloadTikTok(url, { ...options, mode: 'audio' })
}

module.exports = {
  TIKTOK_HOSTS,
  DEFAULT_MAX_BYTES,
  isTikTokUrl,
  cleanTikTokUrl,
  resolveTikTokCookies,
  downloadTikTok,
  downloadTikTokVideo,
  downloadTikTokAudio,
  detectTikTokMediaType
}
