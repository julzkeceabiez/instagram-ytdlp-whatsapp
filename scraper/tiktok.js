'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const ytdlp = require('./yt-dlp')

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'
const PHOTO_PATH_RE = /\/photo\/\d+/i

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

function isTikTokPhotoUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return TIKTOK_HOSTS.has(url.hostname.toLowerCase()) && PHOTO_PATH_RE.test(url.pathname)
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

function cookieHeaderFromNetscape(content) {
  return String(content || '').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('\t')).filter(parts => parts.length >= 7).map(parts => `${parts[5]}=${parts[6]}`).join('; ')
}

function extractTikTokPhotoMediaUrls(html) {
  const decoded = String(html || '').replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&')
  const matches = decoded.match(/https?:\/\/[^"'<>\s\\]+/g) || []
  return [...new Set(matches.map(value => value.replace(/[),.]+$/, '')).filter(value => /(?:tiktokcdn|ibytedtos|muscdn|akamaized)/i.test(value) && /(?:\.jpe?g|\.png|\.webp|image|jpeg|photo)/i.test(value)))]
}

async function fetchWithRetry(url, options = {}) {
  let lastError
  const attempts = Math.max(1, Math.min(Number(options.retries ?? 2) + 1, 4))
  const headers = { 'user-agent': options.userAgent || DEFAULT_USER_AGENT, referer: 'https://www.tiktok.com/', ...(options.headers || {}) }
  if (options.cookies) headers.cookie = cookieHeaderFromNetscape(await fs.readFile(options.cookies, 'utf8'))
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow', signal: options.signal })
      if (response.ok) return response
      const error = new Error(`HTTP ${response.status}`)
      error.code = response.status === 403 ? 'TIKTOK_FORBIDDEN' : 'TIKTOK_HTTP_ERROR'
      lastError = error
      if (![403, 429, 500, 502, 503, 504].includes(response.status)) throw error
    } catch (error) {
      lastError = error
      if (error.name === 'AbortError') throw error
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw lastError || new Error('TikTok request gagal')
}

async function downloadTikTokPhoto(input, options = {}) {
  const url = cleanTikTokUrl(input)
  if (!isTikTokPhotoUrl(url)) throw Object.assign(new Error('URL bukan TikTok photo post'), { code: 'INVALID_TIKTOK_PHOTO_URL' })
  const root = options.outputRoot || process.env.TIKTOK_TMP_DIR || path.join(process.cwd(), 'tmp', 'tiktok')
  const outputDir = await createRequestDir(root)
  const cookies = await resolveTikTokCookies(options)
  const maxBytes = Number(options.maxBytes || process.env.TIKTOK_MAX_BYTES || DEFAULT_MAX_BYTES)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || Number(process.env.TIKTOK_TIMEOUT_MS) || 120000)
  try {
    const page = await fetchWithRetry(url, { cookies, userAgent: options.userAgent, retries: options.retries, signal: controller.signal })
    const candidates = extractTikTokPhotoMediaUrls(await page.text()).slice(0, Math.max(1, Math.min(Number(options.maxItems || 20), 20)))
    if (!candidates.length) throw new Error('Media foto TikTok tidak ditemukan pada halaman; cookies mungkin kedaluwarsa atau halaman membutuhkan akses')
    const files = []
    for (const [index, mediaUrl] of candidates.entries()) {
      const media = await fetchWithRetry(mediaUrl, { cookies, userAgent: options.userAgent, retries: options.retries, signal: controller.signal })
      const contentType = media.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) continue
      const buffer = Buffer.from(await media.arrayBuffer())
      if (buffer.length > maxBytes) throw Object.assign(new Error('File foto TikTok melebihi batas'), { code: 'YTDLP_FILE_TOO_LARGE' })
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const file = path.join(outputDir, `photo-${index + 1}.${ext}`)
      await fs.writeFile(file, buffer)
      files.push({ path: file, size: buffer.length, mimetype: contentType })
    }
    if (!files.length) throw new Error('Tidak ada gambar TikTok yang berhasil diunduh')
    return { path: files[0].path, size: files[0].size, files, sourceUrl: url, mode: 'photo', mediaType: 'photo', title: 'TikTok Photo Post', id: url.match(/\/photo\/(\d+)/i)?.[1] || null, cookiesPath: cookies, cleanup: async () => fs.rm(outputDir, { recursive: true, force: true }) }
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
    if (error.code === 'TIKTOK_FORBIDDEN') throw new Error('TikTok mengembalikan 403 Forbidden. Perbarui cookies yang sah atau gunakan satu proxy tepercaya melalui TIKTOK_PROXY; rotasi proxy tidak dilakukan.')
    if (error.name === 'AbortError') throw Object.assign(new Error('Download TikTok photo timeout'), { code: 'YTDLP_TIMEOUT' })
    throw normalizeError(error)
  } finally {
    clearTimeout(timer)
  }
}

function normalizeError(error) {
  if (error?.code === 'YTDLP_START_FAILED') return new Error('yt-dlp belum terpasang atau tidak ditemukan di PATH server')
  if (error?.code === 'YTDLP_TIMEOUT') return new Error('Download TikTok timeout. Coba lagi dengan media yang lebih kecil')
  if (error?.code === 'YTDLP_FILE_TOO_LARGE') return new Error('Ukuran media TikTok melebihi batas pengiriman bot')
  const message = String(error?.message || error)
  if (/403|forbidden/i.test(message)) return new Error('TikTok mengembalikan 403 Forbidden. Perbarui cookies yang sah atau gunakan satu proxy tepercaya melalui TIKTOK_PROXY; rotasi proxy tidak dilakukan.')
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
  if (isTikTokPhotoUrl(url) && requestedMode !== 'audio') return downloadTikTokPhoto(url, options)
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
    proxy: options.proxy || process.env.TIKTOK_PROXY,
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
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
  isTikTokPhotoUrl,
  cleanTikTokUrl,
  extractTikTokPhotoMediaUrls,
  resolveTikTokCookies,
  downloadTikTok,
  downloadTikTokVideo,
  downloadTikTokAudio,
  downloadTikTokPhoto,
  detectTikTokMediaType
}
