'use strict'

const fs = require('node:fs/promises')
const { searchPinterest, downloadPinterest, isPinterestPinUrl } = require('../scraper/pinterest')

function getCommandText({ text = '', args = [] } = {}) {
  if (Array.isArray(args) && args.length) return args.join(' ').trim()
  return String(text || '').trim()
}

function extractPinterestUrl(value) {
  const match = String(value || '').match(/https?:\/\/[^\s]+/i)
  return match ? match[0].replace(/[),.;]+$/, '') : null
}

async function reply({ Reply, alip, m, text }) {
  if (typeof Reply === 'function') return Reply(text)
  return alip.sendMessage(m.chat, { text }, { quoted: m })
}

async function react(alip, m, text) {
  if (alip?.sendMessage && m?.key) await alip.sendMessage(m.chat, { react: { text, key: m.key } }).catch(() => {})
}

function mediaCaption(result, index, total) {
  const title = result.info?.title || result.title || 'Pinterest'
  return index === 0 ? `📌 Pinterest\n${title}${total > 1 ? `\nMedia: ${total}` : ''}` : ''
}

async function handlePinterestCase({
  alip,
  m,
  text,
  args,
  command = 'pindl',
  mode = /^(pinaudio|pintomp3|pindlmp3)$/i.test(command) ? 'audio' : 'video',
  isRegistered = () => true,
  isCreator = false,
  isPremium = false,
  checkLimit = () => false,
  addLimit = () => {},
  Reply,
  searchLimit = 8,
  maxBytes,
  timeoutMs,
  autoDetect = true
} = {}) {
  if (!alip?.sendMessage || !m?.chat) throw new TypeError('alip dan m.chat wajib tersedia')
  if (!isRegistered(m.sender) && !isCreator) return reply({ Reply, alip, m, text: 'Silakan daftar terlebih dahulu.' })
  if (checkLimit(m.sender, isPremium, isCreator)) return reply({ Reply, alip, m, text: 'Limit download Anda sudah habis.' })

  const commandText = getCommandText({ text, args })
  const isSearch = /^(pinsearch|pinsear|psearch)$/i.test(command)
  if (isSearch) {
    if (!commandText) return reply({ Reply, alip, m, text: 'Contoh: .pinsearch wallpaper anime' })
    await react(alip, m, '🔎')
    try {
      const result = await searchPinterest(commandText, { limit: searchLimit, timeoutMs })
      if (!result.pins.length) return reply({ Reply, alip, m, text: `Tidak menemukan pin untuk: ${result.query}` })
      const body = result.pins.map((pin, index) => `${index + 1}. ${pin}`).join('\n')
      await reply({ Reply, alip, m, text: `📌 *Hasil Pinterest: ${result.query}*\n\n${body}\n\nGunakan .pindl <URL> untuk mengunduh.` })
      await react(alip, m, '✅')
      return { ok: true, mode: 'search', query: result.query, pins: result.pins }
    } catch (error) {
      await react(alip, m, '❌')
      await reply({ Reply, alip, m, text: `❌ ${error.message}` })
      return { ok: false, error }
    }
  }

  const url = extractPinterestUrl(commandText)
  if (!url || !isPinterestPinUrl(url)) return reply({ Reply, alip, m, text: 'Kirim URL pin Pinterest yang valid. Contoh: .pindl https://www.pinterest.com/pin/123456789/' })
  await react(alip, m, '🕖')
  await reply({ Reply, alip, m, text: `⏳ Mengunduh Pinterest ${mode === 'audio' ? 'audio' : 'media'}...` })
  let result
  try {
    result = await downloadPinterest(url, { mode, autoDetect, maxBytes, timeoutMs })
    const files = Array.isArray(result.files) && result.files.length ? result.files : [{ path: result.path, size: result.size }]
    for (const [index, item] of files.entries()) {
      const buffer = await fs.readFile(item.path)
      const caption = mediaCaption(result, index, files.length)
      const payload = result.mode === 'audio'
        ? { audio: buffer, mimetype: 'audio/mpeg', fileName: `pinterest-${index + 1}.mp3`, ptt: false }
        : result.mode === 'photo'
          ? { image: buffer, mimetype: item.mimetype || 'image/jpeg', fileName: `pinterest-${index + 1}.jpg`, caption }
          : { video: buffer, mimetype: 'video/mp4', fileName: `pinterest-${index + 1}.mp4`, caption }
      await alip.sendMessage(m.chat, payload, { quoted: m })
    }
    if (typeof addLimit === 'function') addLimit(m.sender, isPremium, isCreator)
    await result.cleanup?.()
    await react(alip, m, '✅')
    return { ok: true, mode: result.mode, mediaType: result.mediaType, files: result.files }
  } catch (error) {
    await result?.cleanup?.().catch?.(() => {})
    await react(alip, m, '❌')
    await reply({ Reply, alip, m, text: `❌ ${error.message || 'Gagal mengunduh Pinterest.'}` })
    return { ok: false, error }
  }
}

module.exports = { getCommandText, extractPinterestUrl, handlePinterestCase }
