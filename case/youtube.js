'use strict'

const fs = require('node:fs/promises')
const { downloadYouTube } = require('../scraper/youtube')

function extractYouTubeUrl(text = '') {
  const match = String(text).match(/https?:\/\/[^\s]+/i)
  return match ? match[0].replace(/[),.]+$/, '') : ''
}

function getCommandText({ text = '', args = [] } = {}) {
  if (Array.isArray(args) && args.length) return args.join(' ').trim()
  return String(text || '').trim()
}

function friendlyError(error) {
  return error?.message || 'Download YouTube gagal. Coba lagi nanti.'
}

/**
 * Handler case YouTube.
 *
 * Contoh di dispatcher utama:
 *
 * case 'ytmp4':
 * case 'ytvideo':
 *   return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video' })
 *
 * case 'ytmp3':
 * case 'ytaudio':
 *   return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'audio' })
 */
async function handleYouTubeCase({ alip, m, text, args, prefix = '.', command = 'ytmp4', mode = 'video' }) {
  if (!alip?.sendMessage || !m?.chat) throw new TypeError('alip dan m.chat wajib tersedia')

  const input = getCommandText({ text, args })
  const url = extractYouTubeUrl(input)
  if (!url) {
    const example = mode === 'audio' ? 'ytmp3' : 'ytmp4'
    await alip.sendMessage(m.chat, {
      text: `Format: ${prefix}${command} https://youtu.be/VIDEO_ID\nContoh audio: ${prefix}${example} https://youtu.be/VIDEO_ID`
    }, { quoted: m })
    return { ok: false, code: 'MISSING_URL' }
  }

  await alip.sendMessage(m.chat, {
    text: `⏳ Sedang mengunduh YouTube (${mode === 'audio' ? 'audio' : 'video'})...`
  }, { quoted: m })

  let result
  try {
    result = await downloadYouTube(url, { mode })
    const buffer = await fs.readFile(result.path)
    const payload = mode === 'audio'
      ? {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: result.filename,
          ptt: false
        }
      : {
          video: buffer,
          mimetype: 'video/mp4',
          fileName: result.filename,
          caption: `✅ YouTube Downloader\n${result.title || 'Video YouTube'}\n\nSumber: ${result.sourceUrl}`.slice(0, 1024)
        }
    await alip.sendMessage(m.chat, payload, { quoted: m })
    return { ok: true, path: result.path, id: result.id, mode }
  } catch (error) {
    await alip.sendMessage(m.chat, { text: `❌ ${friendlyError(error)}` }, { quoted: m })
    return { ok: false, code: error?.code || 'DOWNLOAD_FAILED', error }
  } finally {
    await result?.cleanup?.()
  }
}

module.exports = { extractYouTubeUrl, getCommandText, handleYouTubeCase }
