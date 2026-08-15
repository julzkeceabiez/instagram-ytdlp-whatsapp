'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_MAX_BYTES = 1_500 * 1024 * 1024
const URL_RE = /^https?:\/\/[^\s]+$/i

function cleanUrl(value) {
  const input = String(value || '').trim()
  if (!URL_RE.test(input)) throw new TypeError('URL harus berupa http/https URL yang valid')
  return input
}

function resolveBinary(options = {}) {
  return options.binary || process.env.YTDLP_BIN || 'yt-dlp'
}

function parseJsonLines(stdout) {
  const records = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const value = line.trim()
    if (!value || (!value.startsWith('{') && !value.startsWith('['))) continue
    try { records.push(JSON.parse(value)) } catch {}
  }
  return records
}

function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: { ...process.env, ...(options.env || {}) }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      const error = new Error(`yt-dlp timeout setelah ${timeoutMs} ms`)
      error.code = 'YTDLP_TIMEOUT'
      settled = true
      reject(error)
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      options.onStdout?.(chunk.toString())
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
      options.onStderr?.(chunk.toString())
    })
    child.once('error', error => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      error.code = error.code || 'YTDLP_START_FAILED'
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (code !== 0) {
        const error = new Error((stderr || stdout || `yt-dlp keluar dengan kode ${code}`).trim().slice(-4000))
        error.code = 'YTDLP_FAILED'
        error.exitCode = code
        error.stderr = stderr
        error.stdout = stdout
        return reject(error)
      }
      resolve({ stdout, stderr })
    })
  })
}

function baseArgs(options = {}) {
  const args = ['--ignore-config', '--no-warnings', '--no-playlist', '--restrict-filenames', '--newline']
  if (options.cookies) args.push('--cookies', path.resolve(options.cookies))
  else if (process.env.YTDLP_COOKIES) args.push('--cookies', path.resolve(process.env.YTDLP_COOKIES))
  if (options.proxy) args.push('--proxy', String(options.proxy))
  if (options.userAgent) args.push('--user-agent', String(options.userAgent))
  if (options.referer) args.push('--referer', String(options.referer))
  if (options.extractorArgs) args.push('--extractor-args', String(options.extractorArgs))
  return args
}

async function getInfo(url, options = {}) {
  const target = cleanUrl(url)
  const args = [...baseArgs(options), '--dump-single-json', '--skip-download', target]
  const result = await run(resolveBinary(options), args, options)
  const records = parseJsonLines(result.stdout)
  const info = records.at(-1)
  if (!info || typeof info !== 'object') throw new Error('yt-dlp tidak mengembalikan metadata JSON yang valid')
  return info
}

function chooseFormat(mode, options = {}) {
  if (options.format) return String(options.format)
  if (mode === 'audio') return 'ba/b'
  if (mode === 'photo') return 'best[ext=jpg]/best[ext=jpeg]/best[ext=png]/best'
  const quality = Number(options.quality)
  if (Number.isFinite(quality) && quality > 0) {
    return `bv*[height<=${Math.floor(quality)}][ext=mp4]+ba[ext=m4a]/b[height<=${Math.floor(quality)}][ext=mp4]/b[height<=${Math.floor(quality)}]/b`
  }
  return 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b'
}

function safeLimitBytes(value) {
  const limit = Number(value ?? process.env.YTDLP_MAX_BYTES ?? DEFAULT_MAX_BYTES)
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_MAX_BYTES
}

async function findDownloadedFile(directory, before = new Set()) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.part') || entry.name.endsWith('.ytdl')) continue
    const full = path.join(directory, entry.name)
    if (!before.has(full)) files.push(full)
  }
  if (!files.length) return null
  const stats = await Promise.all(files.map(async file => ({ file, stat: await fs.stat(file) })))
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  return stats[0].file
}

async function download(url, options = {}) {
  const target = cleanUrl(url)
  const mode = ['audio', 'photo', 'video'].includes(options.mode) ? options.mode : (options.audio ? 'audio' : 'video')
  const outputDir = path.resolve(options.outputDir || path.join(process.cwd(), 'tmp', 'yt-dlp'))
  await fs.mkdir(outputDir, { recursive: true })
  const before = new Set((await fs.readdir(outputDir, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.join(outputDir, entry.name)))

  const args = [
    ...baseArgs(options),
    '--format', chooseFormat(mode, options),
    '--output', path.join(outputDir, '%(title).180B [%(id)s].%(ext)s'),
    '--max-filesize', `${Math.floor(safeLimitBytes(options.maxBytes) / 1024 / 1024)}M`
  ]
  if (mode === 'audio') args.push('--extract-audio', '--audio-format', options.audioFormat || 'mp3', '--audio-quality', options.audioQuality || '0')
  else if (mode === 'video') args.push('--merge-output-format', options.container || 'mp4')
  args.push(target)

  const result = await run(resolveBinary(options), args, options)
  const file = await findDownloadedFile(outputDir, before)
  if (!file) throw new Error('yt-dlp selesai tetapi file hasil tidak ditemukan')
  const stat = await fs.stat(file)
  const maxBytes = safeLimitBytes(options.maxBytes)
  if (stat.size > maxBytes) {
    await fs.rm(file, { force: true })
    const error = new Error(`File melebihi batas ${maxBytes} bytes`)
    error.code = 'YTDLP_FILE_TOO_LARGE'
    throw error
  }

  let info = null
  const records = parseJsonLines(result.stdout)
  if (records.length) info = records.at(-1)
  return { path: file, size: stat.size, mode, title: info?.title || path.basename(file), id: info?.id || null, info }
}

async function downloadAudio(url, options = {}) {
  return download(url, { ...options, mode: 'audio' })
}

async function downloadVideo(url, options = {}) {
  return download(url, { ...options, mode: 'video' })
}

async function downloadPhoto(url, options = {}) {
  return download(url, { ...options, mode: 'photo' })
}
module.exports = { getInfo, download, downloadAudio, downloadVideo, downloadPhoto, cleanUrl, run, chooseFormat }