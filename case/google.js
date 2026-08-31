'use strict';

const { 
  googleSearch, 
  googleImage, 
  googleSuggest, 
  googleTranslate, 
  googleNews, 
  googleVideo 
} = require('../scraper/google');

const { 
  formatSearch, 
  formatImage, 
  formatNews, 
  formatVideo 
} = require('../scraper/google_formatter');

/**
 * ShadowBot Google Case Handler
 */
async function handleGoogleCase({
  alip,
  m,
  text,
  args,
  command,
  isRegistered = () => true,
  isCreator = false,
  checkLimit = () => false,
  addLimit = () => {},
  Reply
}) {
  if (!alip || !m) return;
  if (!isRegistered(m.sender) && !isCreator) return Reply('Silakan daftar terlebih dahulu.');
  
  const query = args.join(' ').trim() || text?.trim();
  
  // React processing
  await alip.sendMessage(m.chat, { react: { text: '🔍', key: m.key } }).catch(() => {});

  try {
    switch (command) {
      case 'google':
      case 'search': {
        if (!query) return Reply('Contoh: .google apa itu AI');
        if (checkLimit(m.sender)) return Reply('Limit harian Anda habis.');
        const results = await googleSearch(query);
        await Reply(formatSearch(results, query));
        addLimit(m.sender);
        break;
      }

      case 'gimage':
      case 'googleimage': {
        if (!query) return Reply('Contoh: .gimage kucing lucu');
        const results = await googleImage(query);
        if (results.length === 0) return Reply('Gambar tidak ditemukan.');
        // Send first image as example or all? Usually bots send one or a few.
        // For this handler, we send the formatted list and the first image.
        await alip.sendMessage(m.chat, { 
          image: { url: results[0].url }, 
          caption: formatImage(results.slice(0, 5), query) 
        }, { quoted: m });
        break;
      }

      case 'gvideo': {
        if (!query) return Reply('Contoh: .gvideo tutorial nodejs');
        const results = await googleVideo(query);
        await Reply(formatVideo(results, query));
        break;
      }

      case 'tr':
      case 'translate': {
        // pattern: .tr id Hello world
        const target = args[0] || 'id';
        const txt = args.slice(1).join(' ');
        if (!txt) return Reply('Contoh: .tr id Hello world');
        const result = await googleTranslate(txt, target);
        await Reply(`*Translate (${target})*:\n\n${result}`);
        break;
      }

      case 'gnews': {
        if (!query) return Reply('Contoh: .gnews teknologi');
        const results = await googleNews(query);
        await Reply(formatNews(results, query));
        break;
      }
      
      case 'gsuggest': {
        if (!query) return Reply('Contoh: .gsuggest cara membuat');
        const results = await googleSuggest(query);
        await Reply(`💡 *Suggestions for:* ${query}\n\n` + results.map((s, i) => `${i+1}. ${s}`).join('\n'));
        break;
      }
    }
    
    await alip.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
  } catch (e) {
    console.error('Google Case Error:', e);
    await alip.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    Reply(`❌ *Error:* ${e.message}`);
  }
}

module.exports = { handleGoogleCase };
