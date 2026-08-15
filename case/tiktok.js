'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { downloadTikTok } = require('../scraper/tiktok')

function getCommandText({ text = '', args = [] } = {}) {
  if (Array.isArray(args) && args.length) return args.join(' ').trim()
  return String(text || '').trim()
}

function extractTikTokUrl(input = '') {
  const match = String(input).match(/https?:\/\/[^\s]+/i)
  return match ? match[0].replace(/[),.]+$/, '') : ''
}

async function sendReply({ Reply, alip, m, text }) {
  if (typeof Reply === 'function') return Reply(text)
  if (alip?.sendMessage && m?.chat) return alip.sendMessage(m.chat, { text }, { quoted: m })
}

async function react(alip, m, text) {
  if (alip?.sendMessage && m?.key) {
    await alip.sendMessage(m.chat, { react: { text, key: m.key } }).catch(() => {})
  }
}

function captionFor(result, index, total) {
  const title = result.title || 'TikTok Downloader'
  const suffix = total > 1 ? ` (${index + 1}/${total})` : ''
  return `╼ ׅ ֹ𔖰᷼𔖮 *TikTok Downloader*${suffix}\n╭╼─┈───┈──⣾╼╯\n┆𖢷 ׁ 𖹭₊ Judul : ${title}\n┆𖢷 ׁ 𖹭₊ Author : ${result.info?.uploader || result.info?.channel || 'Tidak diketahui'}\n╰─╼𔕬─┈───┈───┈`.slice(0, 1024)
}

/**
 * Handler case yang mengikuti struktur gating dan limit dari contoh pengguna.
 *
 * Dispatcher contoh:
 * case 'tt':
 * case 'tiktok':
 *   return handleTikTokCase({ alip, m, text, args, prefix, command, isRegistered, isCreator, checkLimit, addLimit, Reply })
 *
 * case 'ttmp3':
 *   return handleTikTokCase({ alip, m, text, args, prefix, command, mode: 'audio', isRegistered, isCreator, checkLimit, addLimit, Reply })
 */
async function handleTikTokCase({
  alip,
  m,
  text,
  args,
  prefix = '.',
  command = 'tiktok',
  mode = /^(ttmp3|ttaudio|tiktokmp3)$/i.test(command) ? 'audio' : /^(ttfoto|ttphoto|tiktokfoto)$/i.test(command) ? 'photo' : 'video',
  autoDetect = true,
  isRegistered = () => true,
  isCreator = false,
  isPremium = false,
  checkLimit = () => false,
  addLimit = () => {},
  Reply,
  example = value => `${prefix}${command} ${value}`,
  cookies,
  maxBytes,
  timeoutMs
} = {}) {
  if (!alip?.sendMessage || !m?.chat) throw new TypeError('alip dan m.chat wajib tersedia')
  if (!isRegistered(m.sender) && !isCreator) {
    await sendReply({ Reply, alip, m, text: 'Silakan daftar terlebih dahulu.' })
    return { ok: false, code: 'NOT_REGISTERED' }
  }
  if (checkLimit(m.sender, isPremium, isCreator)) {
    await sendReply({ Reply, alip, m, text: 'Limit download Anda sudah habis.' })
    return { ok: false, code: 'LIMIT_REACHED' }
  }

  const input = getCommandText({ text, args })
  const url = extractTikTokUrl(input)
  if (!url) {
    await sendReply({ Reply, alip, m, text: `Gunakan: ${example('url')}` })
    return { ok: false, code: 'MISSING_URL' }
  }

  await react(alip, m, '🕖')
  await sendReply({ Reply, alip, m, text: `⏳ Sedang mengunduh TikTok ${mode === 'audio' ? 'audio' : mode === 'photo' ? 'foto' : 'media'}...` })
  let result
  try {
    result = await downloadTikTok(url, { mode, autoDetect: autoDetect && mode === 'video', cookies, maxBytes, timeoutMs })
    if (typeof addLimit === 'function') addLimit(m.sender, isPremium, isCreator)
    const files = Array.isArray(result.files) && result.files.length ? result.files : [{ path: result.path, size: result.size }]
    for (const [index, item] of files.entries()) {
      const buffer = await fs.readFile(item.path)
      const filename = path.basename(item.path)
      const caption = captionFor(result, index, files.length)
      const effectiveMode = result.mode || mode
      const payload = effectiveMode === 'audio'
        ? { audio: buffer, mimetype: 'audio/mpeg', fileName: filename, ptt: false }
        : effectiveMode === 'photo'
          ? { image: buffer, mimetype: item.mimetype || 'image/jpeg', fileName: filename, caption }
          : { video: buffer, mimetype: 'video/mp4', fileName: filename, caption }
      await alip.sendMessage(m.chat, payload, { quoted: m })
    }
    await react(alip, m, '✅')
    return { ok: true, mode: result.mode || mode, mediaType: result.mediaType || mode, files: result.files, path: result.path, id: result.id }
  } catch (error) {
    await react(alip, m, '❌')
    await sendReply({ Reply, alip, m, text: `❌ ${error.message || 'Gagal mengunduh TikTok.'}` })
    return { ok: false, code: error.code || 'DOWNLOAD_FAILED', error }
  } finally {
    await result?.cleanup?.()
  }
}

module.exports = { getCommandText, extractTikTokUrl, handleTikTokCase }
