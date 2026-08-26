'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const ytdlp = require('./yt-dlp')

const PINTEREST_HOSTS = new Set(['pinterest.com', 'www.pinterest.com', 'id.pinterest.com', 'pin.it'])
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'

function isPinterestUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(url.protocol) && PINTEREST_HOSTS.has(url.hostname.toLowerCase()) && url.pathname.length > 1
  } catch {
    return false
  }
}

function cleanPinterestUrl(value) {
  const input = String(value || '').trim()
  if (!isPinterestUrl(input)) {
    const error = new TypeError('URL harus berupa URL Pinterest yang valid')
    error.code = 'INVALID_PINTEREST_URL'
    throw error
  }
  return input
}

function isPinterestPinUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return isPinterestUrl(value) && (url.hostname === 'pin.it' || /\/pin\/\d+/i.test(url.pathname))
  } catch {
    return false
  }
}

function resolvePinterestCookies(options = {}) {
  return options.cookies || process.env.PINTEREST_COOKIES || path.join(process.cwd(), 'cookies', 'cookiespin.txt')
}

async function cookieHeader(cookiesPath) {
  try {
    const content = await fs.readFile(path.resolve(cookiesPath), 'utf8')
    return content.split(/\r?\n/)
      .filter(line => line && !line.startsWith('#'))
      .map(line => line.split('\t'))
      .filter(parts => parts.length >= 7 && parts[0].replace(/^#HttpOnly_/, '').includes('pinterest.com'))
      .map(parts => `${parts[5]}=${parts[6]}`)
      .join('; ')
  } catch {
    return ''
  }
}

async function requestPinterest(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000)
  try {
    const headers = {
      'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      referer: 'https://www.pinterest.com/',
      ...(options.headers || {})
    }
    const cookies = await cookieHeader(options.cookies || resolvePinterestCookies(options))
    if (cookies) headers.cookie = cookies
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
    if (!response.ok) {
      const error = new Error(`Pinterest HTTP ${response.status}`)
      error.code = response.status === 403 ? 'PINTEREST_FORBIDDEN' : 'PINTEREST_HTTP_ERROR'
      throw error
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

function extractPinUrls(html, limit = 10) {
  const decoded = String(html || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
  const matches = decoded.match(/https?:\/\/[^"'<>\s]+\/pin\/\d+[^"'<>\s]*/gi) || []
  const relative = decoded.match(/(?:https?:\/\/[^"'<>\s]+)?\/pin\/\d+[^"'<>\s]*/gi) || []
  const all = [...matches, ...relative].map(value => {
    const cleaned = value.replace(/[),.]+$/, '')
    return cleaned.startsWith('http') ? cleaned : `https://www.pinterest.com${cleaned}`
  })
  return [...new Set(all)].slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)))
}

function extractSearchQuery(input) {
  const query = String(input || '').trim()
  if (!query || query.length > 120) {
    const error = new TypeError('Query Pinterest kosong atau terlalu panjang')
    error.code = 'INVALID_PINTEREST_QUERY'
    throw error
  }
  return query
}

async function searchPinterest(input, options = {}) {
  const query = extractSearchQuery(input)
  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`
  const response = await requestPinterest(url, options)
  const pins = extractPinUrls(await response.text(), options.limit || 10)
  return { query, url, pins, count: pins.length, cookiesPath: resolvePinterestCookies(options) }
}

function detectPinterestMode(info = {}) {
  const ext = String(info.ext || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'photo'
  if (Number(info.duration) === 0 && Array.isArray(info.thumbnails) && info.thumbnails.length) return 'photo'
  return 'video'
}

async function createRequestDir(root) {
  const directory = path.resolve(root)
  await fs.mkdir(directory, { recursive: true })
  return fs.mkdtemp(path.join(directory, 'request-'))
}

function normalizePinterestError(error) {
  if (error?.code === 'YTDLP_START_FAILED') return new Error('yt-dlp belum terpasang atau tidak ditemukan di PATH server')
  if (error?.code === 'YTDLP_TIMEOUT') return new Error('Download Pinterest timeout')
  if (error?.code === 'YTDLP_FILE_TOO_LARGE') return new Error('File Pinterest melebihi batas pengiriman bot')
  const message = String(error?.message || error)
  if (/403|forbidden/i.test(message)) return new Error('Pinterest mengembalikan 403 Forbidden. Perbarui cookies Pinterest yang sah atau gunakan konfigurasi jaringan server yang benar.')
  if (/login required|private|captcha|cookies/i.test(message)) return new Error('Pinterest membutuhkan akses yang sah atau cookies sudah kedaluwarsa')
  return new Error(`Download Pinterest gagal: ${message.slice(-500)}`)
}

async function downloadPinterest(input, options = {}) {
  const url = cleanPinterestUrl(input)
  if (!isPinterestPinUrl(url)) {
    const error = new TypeError('URL harus berupa URL pin Pinterest, bukan halaman pencarian')
    error.code = 'INVALID_PINTEREST_PIN_URL'
    throw error
  }
  const mode = options.mode === 'audio' ? 'audio' : options.mode === 'photo' ? 'photo' : 'video'
  const root = options.outputRoot || process.env.PINTEREST_TMP_DIR || path.join(process.cwd(), 'tmp', 'pinterest')
  const outputDir = await createRequestDir(root)
  const cookies = resolvePinterestCookies(options)
  const common = {
    ...options,
    ...(cookies ? { cookies } : {}),
    outputDir,
    maxBytes: Number(options.maxBytes || process.env.PINTEREST_MAX_BYTES || DEFAULT_MAX_BYTES),
    timeoutMs: options.timeoutMs || Number(process.env.PINTEREST_TIMEOUT_MS) || 180000,
    proxy: options.proxy || process.env.PINTEREST_PROXY,
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
    referer: 'https://www.pinterest.com/',
    container: options.container || 'mp4'
  }
  try {
    let effectiveMode = mode
    let info = null
    if (options.autoDetect && mode === 'video') {
      info = await ytdlp.getInfo(url, common)
      effectiveMode = detectPinterestMode(info)
    }
    const result = effectiveMode === 'audio'
      ? await ytdlp.downloadAudio(url, { ...common, audioFormat: options.audioFormat || 'mp3' })
      : effectiveMode === 'photo'
        ? await ytdlp.downloadPhoto(url, common)
        : await ytdlp.downloadVideo(url, common)
    return {
      ...result,
      sourceUrl: url,
      mode: effectiveMode,
      mediaType: effectiveMode,
      info: result.info || info,
      cookiesPath: cookies,
      cleanup: async () => fs.rm(outputDir, { recursive: true, force: true })
    }
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
    throw normalizePinterestError(error)
  }
}

async function downloadPinterestAudio(url, options = {}) {
  return downloadPinterest(url, { ...options, mode: 'audio' })
}

module.exports = {
  PINTEREST_HOSTS,
  DEFAULT_MAX_BYTES,
  isPinterestUrl,
  isPinterestPinUrl,
  cleanPinterestUrl,
  resolvePinterestCookies,
  extractPinUrls,
  extractSearchQuery,
  searchPinterest,
  detectPinterestMode,
  downloadPinterest,
  downloadPinterestAudio
}
