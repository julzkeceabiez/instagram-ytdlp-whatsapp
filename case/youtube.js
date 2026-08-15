'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
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

function extractQuality(text = '') {
  const match = String(text).match(/\b(\d{2,4})\s*p?\b/i)
  return match ? Number(match[1]) : undefined
}

function hasPlaylistFlag(text = '') {
  return /(^|\s)(--?all|all|playlist|ytall)(?=\s|$)/i.test(String(text))
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
async function handleYouTubeCase({ alip, m, text, args, prefix = '.', command = 'ytmp4', mode = 'video', quality, playlist = false, maxItems = 20, liveFromStart = false }) {
  mode = mode === 'audio' ? 'audio' : 'video'
  if (!alip?.sendMessage || !m?.chat) throw new TypeError('alip dan m.chat wajib tersedia')

  const input = getCommandText({ text, args })
  const url = extractYouTubeUrl(input)
  const selectedQuality = quality || extractQuality(input) || 'best'
  const selectedPlaylist = Boolean(playlist || hasPlaylistFlag(input) || /^(ytall|ytplaylist)$/i.test(command))
  if (!url) {
    const example = mode === 'audio' ? 'ytmp3' : 'ytmp4'
    await alip.sendMessage(m.chat, {
      text: `Format: ${prefix}${command} [kualitas] https://youtu.be/VIDEO_ID\nContoh: ${prefix}ytmp4 720p https://youtu.be/VIDEO_ID\nPlaylist: ${prefix}ytall https://www.youtube.com/playlist?list=...`
    }, { quoted: m })
    return { ok: false, code: 'MISSING_URL' }
  }

  await alip.sendMessage(m.chat, {
      text: `⏳ Sedang mengunduh YouTube (${mode === 'audio' ? 'audio' : `video ${/^\d+$/.test(String(selectedQuality)) ? `${selectedQuality}p` : selectedQuality}`}${selectedPlaylist ? ', playlist' : ''})...`
  }, { quoted: m })

  let result
  try {
    result = await downloadYouTube(url, { mode, quality: selectedQuality, playlist: selectedPlaylist, maxItems, liveFromStart })
    const effectiveMode = result.mode || mode
    const files = Array.isArray(result.files) && result.files.length ? result.files : [{ path: result.path, size: result.size }]
    for (const [index, item] of files.entries()) {
      const buffer = await fs.readFile(item.path)
      const caption = `✅ YouTube Downloader${files.length > 1 ? ` (${index + 1}/${files.length})` : ''}\n${result.title || 'Media YouTube'}\n\nSumber: ${result.sourceUrl}`.slice(0, 1024)
      const filename = path.basename(item.path)
      const payload = effectiveMode === 'audio'
        ? { audio: buffer, mimetype: 'audio/mpeg', fileName: filename, ptt: false }
        : effectiveMode === 'photo'
          ? { image: buffer, mimetype: 'image/jpeg', fileName: filename, caption }
          : { video: buffer, mimetype: 'video/mp4', fileName: filename, caption }
      await alip.sendMessage(m.chat, payload, { quoted: m })
    }
    return { ok: true, path: result.path, files: result.files, id: result.id, mode: effectiveMode, playlist: selectedPlaylist }
  } catch (error) {
    await alip.sendMessage(m.chat, { text: `❌ ${friendlyError(error)}` }, { quoted: m })
    return { ok: false, code: error?.code || 'DOWNLOAD_FAILED', error }
  } finally {
    await result?.cleanup?.()
  }
}

module.exports = { extractYouTubeUrl, extractQuality, hasPlaylistFlag, getCommandText, handleYouTubeCase }
