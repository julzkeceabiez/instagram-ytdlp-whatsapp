'use strict';

/**
 * ShadowBot Google Response Formatter
 * Tidies up scraper results for WhatsApp bot messages
 */

function formatSearch(results, query) {
  if (!results || results.length === 0) return `❌ Tidak ditemukan hasil untuk: *${query}*`;
  
  let text = `🔍 *Google Search: ${query}*\n\n`;
  results.forEach((res, i) => {
    text += `${i + 1}. *${res.title}*\n🔗 ${res.url}\n📝 ${res.snippet || '-'}\n\n`;
  });
  return text.trim();
}

function formatImage(results, query) {
  if (!results || results.length === 0) return `❌ Tidak ditemukan gambar untuk: *${query}*`;
  
  let text = `🖼️ *Google Image: ${query}*\n\n`;
  results.forEach((res, i) => {
    text += `${i + 1}. *${res.title}*\n📏 ${res.width || '?'}x${res.height || '?'}\n🔗 ${res.url}\n\n`;
  });
  return text.trim();
}

function formatNews(results, query) {
  if (!results || results.length === 0) return `📰 Tidak ada berita untuk: *${query}*`;
  
  let text = `📰 *Google News: ${query}*\n\n`;
  results.forEach((res, i) => {
    text += `${i + 1}. *${res.title}*\n🏢 Sumber: ${res.source}\n📅 ${res.pubDate}\n🔗 ${res.link}\n\n`;
  });
  return text.trim();
}

function formatVideo(results, query) {
  if (!results || results.length === 0) return `🎥 Tidak ada video untuk: *${query}*`;
  
  let text = `🎥 *Google Video: ${query}*\n\n`;
  results.forEach((res, i) => {
    text += `${i + 1}. *${res.title}*\n⏱️ Durasi: ${res.duration || '-'}\n🔗 ${res.url}\n\n`;
  });
  return text.trim();
}

module.exports = { formatSearch, formatImage, formatNews, formatVideo };
