'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const ytdlp = require('./yt-dlp')

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024

function isInstagramUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return (url.protocol === 'https:' || url.protocol === 'http:') && INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function cleanInstagramUrl(value) {
  const input = String(value || '').trim()
  if (!isInstagramUrl(input)) {
    const error = new TypeError('URL harus berupa URL Instagram yang valid')
    error.code = 'INVALID_INSTAGRAM_URL'
    throw error
  }
  return input
}

async function createRequestDir(root = path.join(process.cwd(), 'tmp', 'instagram')) {
  const directory = path.resolve(root)
  await fs.mkdir(directory, { recursive: true })
  return fs.mkdtemp(path.join(directory, 'request-'))
}

function normalizeError(error) {
  if (error?.code === 'YTDLP_START_FAILED') {
    return new Error('yt-dlp belum terpasang atau tidak ditemukan di PATH server')
  }
  if (error?.code === 'YTDLP_TIMEOUT') {
    return new Error('Download Instagram timeout. Coba lagi dengan URL atau media yang lebih kecil')
  }
  if (error?.code === 'YTDLP_FILE_TOO_LARGE') {
    return new Error('Ukuran media melebihi batas pengiriman bot')
  }
  const message = String(error?.message || error)
  if (/login required|login|private|authentication|cookies/i.test(message)) {
    return new Error('Media membutuhkan login atau berasal dari akun privat; gunakan akses yang sah')
  }
  return new Error(`Download Instagram gagal: ${message.slice(-500)}`)
}

async function downloadInstagramMedia(input, options = {}) {
  const url = cleanInstagramUrl(input)
  const mode = options.mode === 'photo' ? 'photo' : 'video'
  const root = options.outputRoot || process.env.INSTAGRAM_TMP_DIR || path.join(process.cwd(), 'tmp', 'instagram')
  const outputDir = await createRequestDir(root)
  const maxBytes = Number(options.maxBytes || process.env.INSTAGRAM_MAX_BYTES || DEFAULT_MAX_BYTES)
  const ytdlpOptions = {
    ...options,
    outputDir,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs || Number(process.env.INSTAGRAM_TIMEOUT_MS) || 120000,
    format: options.format || 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    container: 'mp4'
  }

  try {
    const result = mode === 'photo'
      ? await ytdlp.downloadPhoto(url, ytdlpOptions)
      : await ytdlp.downloadVideo(url, ytdlpOptions)
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

async function removeTemporaryFile(result) {
  if (result?.cleanup) return result.cleanup()
  if (result?.path) return fs.rm(result.path, { force: true }).catch(() => {})
}

const downloadInstagram = downloadInstagramMedia

module.exports = {
  INSTAGRAM_HOSTS,
  DEFAULT_MAX_BYTES,
  isInstagramUrl,
  cleanInstagramUrl,
  downloadInstagram,
  downloadInstagramMedia,
  removeTemporaryFile,
  requestId: () => crypto.randomUUID()
}
