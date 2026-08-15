'use strict'

const fs = require('node:fs/promises')
const { downloadInstagramMedia, removeTemporaryFile } = require('../scraper/instagram')

function extractInstagramUrl(text = '') {
  const match = String(text).match(/https?:\/\/[^\s]+/i)
  return match ? match[0].replace(/[),.]+$/, '') : ''
}

function getCommandText({ text = '', args = [] } = {}) {
  if (Array.isArray(args) && args.length) return args.join(' ').trim()
  return String(text || '').trim()
}

function friendlyError(error) {
  return error?.message || 'Download Instagram gagal. Coba lagi nanti.'
}

/**
 * Handler yang dapat dipanggil dari dispatcher bot.
 *
 * Contoh pemakaian di case utama:
 *
 * case 'ig':
 * case 'igdl': {
 *   return handleInstagramCase({ alip, m, text, args, prefix, command })
 * }
 */
async function handleInstagramCase({ alip, m, text, args, prefix = '.', command = 'ig', mode = 'video' }) {
  mode = mode === 'photo' ? 'photo' : 'video'
  if (!alip?.sendMessage || !m?.chat) throw new TypeError('alip dan m.chat wajib tersedia')

  const input = getCommandText({ text, args })
  const url = extractInstagramUrl(input)
  if (!url) {
    await alip.sendMessage(m.chat, {
      text: `Format: ${prefix}${command} https://www.instagram.com/reel/xxxxx/`
    }, { quoted: m })
    return { ok: false, code: 'MISSING_URL' }
  }

  await alip.sendMessage(m.chat, {
      text: `⏳ Sedang mengunduh Instagram (${mode === 'photo' ? 'foto' : 'video'})...`
  }, { quoted: m })

  let result
  try {
    result = await downloadInstagramMedia(url, { mode })
    const buffer = await fs.readFile(result.path)
    const caption = `✅ Instagram Downloader\n${result.title || 'Media Instagram'}\n\nSumber: ${result.sourceUrl}`.slice(0, 1024)
    const payload = mode === 'photo'
      ? { image: buffer, mimetype: 'image/jpeg', fileName: result.filename, caption }
      : { video: buffer, mimetype: 'video/mp4', fileName: result.filename, caption }

    await alip.sendMessage(m.chat, payload, { quoted: m })

    return { ok: true, path: result.path, id: result.id }
  } catch (error) {
    await alip.sendMessage(m.chat, {
      text: `❌ ${friendlyError(error)}`
    }, { quoted: m })
    return { ok: false, code: error?.code || 'DOWNLOAD_FAILED', error }
  } finally {
    await removeTemporaryFile(result)
  }
}

module.exports = { extractInstagramUrl, getCommandText, handleInstagramCase }
