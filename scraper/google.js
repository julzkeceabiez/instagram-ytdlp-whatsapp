'use strict';

/**
 * Google Full Scraper (Search, Image, Video, Translate, News, Suggest)
 * Optimized for ShadowBot - No API Key Required
 * Supports cookies from cookies/googlecookies.txt
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
];

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_COOKIES_FILE = path.join(process.cwd(), 'cookies', 'googlecookies.txt');

// ─── UTILS ──────────────────────────────────────────────────────────────────

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function decodeHtml(str) {
  if (!str) return '';
  return str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
  if (!str) return '';
  return decodeHtml(str.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function parseNetscapeCookies(content) {
  const cookies = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim() || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    const parts = line.replace(/^#HttpOnly_/, '').split('\t');
    if (parts.length >= 7) {
      cookies.push(`${parts[5].trim()}=${parts[6].trim()}`);
    }
  }
  return cookies.join('; ');
}

function getCookies(cookieInput, cookieFile = DEFAULT_COOKIES_FILE) {
  if (typeof cookieInput === 'string' && cookieInput.length > 0) {
    if (fs.existsSync(cookieInput)) return parseNetscapeCookies(fs.readFileSync(cookieInput, 'utf8'));
    return cookieInput;
  }
  if (fs.existsSync(cookieFile)) {
    try {
      return parseNetscapeCookies(fs.readFileSync(cookieFile, 'utf8'));
    } catch (e) {
      return '';
    }
  }
  return '';
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
  
  const headers = {
    'User-Agent': options.userAgent || getRandomUserAgent(),
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Referer': 'https://www.google.com/',
    ...options.headers
  };

  const cookieHeader = getCookies(options.cookies, options.cookieFile);
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
      redirect: 'follow'
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Google returned ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── SCRAPER FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Google Search Scraper
 * @param {string} query 
 * @param {object} options 
 * @returns {Promise<Array>}
 */
async function googleSearch(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Query tidak boleh kosong');
  
  const num = Math.min(Math.max(parseInt(options.num) || 10, 1), 50);
  const params = new URLSearchParams({ q, hl: options.hl || 'id', gl: options.gl || 'id' });
  
  const res = await request(`https://www.google.com/search?${params}`, options);
  const html = await res.text();
  
  if (html.includes('detected unusual traffic') || html.includes('/sorry/')) {
    if (options.retry !== false) return googleSearch(query, { ...options, retry: false, cookies: '' });
    throw new Error('Google mendeteksi trafik tidak wajar (CAPTCHA). Harap perbarui cookies.');
  }

  const results = [];
  const items = html.split(/<h3/gi);
  items.shift();

  for (const item of items) {
    const titleMatch = item.match(/>([\s\S]*?)<\/h3>/i);
    const blockBefore = html.slice(Math.max(0, html.indexOf(item) - 1200), html.indexOf(item));
    const urlMatch = blockBefore.match(/<a[^>]+href="([^">]+)"/i) || item.match(/<a[^>]+href="([^">]+)"/i);
    
    if (titleMatch && urlMatch) {
      let url = urlMatch[1];
      if (url.startsWith('/url?')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        url = urlParams.get('q') || url;
      }

      if (url.startsWith('http') && !url.includes('google.com/')) {
        const afterH3 = item.split('</h3>')[1] || '';
        // Look for the actual description block
        const snippetMatch = afterH3.match(/<div[^>]+(?:VwiC3b|aCOpRe|yXK7lf|MUFwCe|BNeawe)[^>]*>([\s\S]*?)<\/div>/i) 
                          || afterH3.match(/<div[^>]*>([\s\S]*?)<\/div>/i)
                          || afterH3.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
        
        const title = stripTags(titleMatch[1]);
        if (title && !results.some(r => r.url === url)) {
          results.push({
            title,
            url,
            snippet: snippetMatch ? stripTags(snippetMatch[1]) : ''
          });
        }
      }
    }
    if (results.length >= num) break;
  }

  return results;
}

/**
 * Google Image Scraper
 * @param {string} query 
 * @param {object} options 
 * @returns {Promise<Array>}
 */
async function googleImage(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Query tidak boleh kosong');
  
  const num = Math.min(Math.max(parseInt(options.num) || 10, 1), 50);
  const params = new URLSearchParams({ q, tbm: 'isch', hl: options.hl || 'id', gl: options.gl || 'id' });
  
  const res = await request(`https://www.google.com/search?${params}`, options);
  const html = await res.text();
  
  const results = [];
  
  // Method 1: AF_initDataCallback (High-res)
  const jsonMatch = html.match(/AF_initDataCallback\s*\({[^}]*key:\s*'ds:1'[^}]*data:\s*([\s\S]*?)\s*}\)\s*;/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = data[31]?.[0]?.[12]?.[2] || data[51]?.[0]?.[12]?.[2];
      if (Array.isArray(items)) {
        for (const item of items) {
          const media = item[1];
          const info = item[2];
          if (media && media[3]) {
            results.push({
              url: media[3][0],
              title: stripTags(info?.[5]?.[0] || info?.[2]?.[0] || q),
              source: info?.[2]?.[0] || '',
              width: media[3][1],
              height: media[3][2]
            });
          }
        }
      }
    } catch (e) {}
  }

  // Method 2: Fallback to metadata scripts
  if (results.length < num) {
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      const content = match[1];
      const urlMatches = content.matchAll(/"(https?:\/\/[^"]+?\.(?:jpg|png|jpeg|webp))",(\d+),(\d+)/gi);
      for (const urlMatch of urlMatches) {
        if (!results.some(r => r.url === urlMatch[1])) {
          results.push({
            url: urlMatch[1],
            title: q,
            width: parseInt(urlMatch[2]),
            height: parseInt(urlMatch[3])
          });
        }
      }
    }
  }

  // Method 3: Last resort (Thumbnails)
  if (results.length === 0) {
    const imgRegex = /<img[^>]+src="([^">]+)"[^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      if (match[1].startsWith('http') && !match[1].includes('google.com/')) {
        results.push({ url: match[1], title: q });
      }
    }
  }

  return results.slice(0, num);
}

/**
 * Google Suggest Scraper
 */
async function googleSuggest(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Query tidak boleh kosong');
  
  const params = new URLSearchParams({ client: 'chrome', q, hl: options.hl || 'id' });
  const res = await request(`https://suggestqueries.google.com/complete/search?${params}`, options);
  const data = await res.json();
  
  return Array.isArray(data?.[1]) ? data[1] : [];
}

/**
 * Google Translate Scraper
 */
async function googleTranslate(text, target = 'id', source = 'auto', options = {}) {
  const q = String(text || '').trim();
  if (!q) throw new Error('Teks tidak boleh kosong');

  try {
    const params = new URLSearchParams({ client: 'gtx', sl: source, tl: target, dt: 't', q });
    const res = await request(`https://translate.googleapis.com/translate_a/single?${params}`, { ...options, timeout: 15000 });
    const data = await res.json();
    return Array.isArray(data?.[0]) ? data[0].map(s => s[0]).join('') : q;
  } catch (e) {
    const params = new URLSearchParams({ sl: source, tl: target, q });
    const res = await request(`https://translate.google.com/m?${params}`, options);
    const html = await res.text();
    const match = html.match(/<div[^>]+class="result-container"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) return stripTags(match[1]);
    throw e;
  }
}

/**
 * Google News Scraper
 */
async function googleNews(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Query tidak boleh kosong');
  
  const params = new URLSearchParams({ q, hl: options.hl || 'id', gl: options.gl || 'ID', ceid: options.ceid || 'ID:id' });
  const res = await request(`https://news.google.com/rss/search?${params}`, options);
  const xml = await res.text();
  
  const results = [];
  const items = xml.split('<item>');
  items.shift();

  for (const item of items) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/i);
    const link = item.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    if (title && link) {
      results.push({
        title: stripTags(title[1]),
        link: stripTags(link[1]),
        pubDate: pubDate ? stripTags(pubDate[1]) : '',
        source: source ? stripTags(source[1]) : ''
      });
    }
  }
  
  return results.slice(0, Math.min(parseInt(options.num) || 10, 50));
}

/**
 * Google Video Scraper
 */
async function googleVideo(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Query tidak boleh kosong');
  
  const num = Math.min(Math.max(parseInt(options.num) || 10, 1), 50);
  const params = new URLSearchParams({ q, tbm: 'vid', hl: options.hl || 'id', gl: options.gl || 'id' });
  
  const res = await request(`https://www.google.com/search?${params}`, options);
  const html = await res.text();
  
  const results = [];
  const items = html.split(/<h3/gi);
  items.shift();

  for (const item of items) {
    const titleMatch = item.match(/>([\s\S]*?)<\/h3>/i);
    const blockBefore = html.slice(Math.max(0, html.indexOf(item) - 1200), html.indexOf(item));
    const urlMatch = blockBefore.match(/<a[^>]+href="([^">]+)"/i) || item.match(/<a[^>]+href="([^">]+)"/i);
    const durationMatch = item.match(/<span>(\d+:\d+)<\/span>/i) || blockBefore.match(/<span>(\d+:\d+)<\/span>/i);

    if (titleMatch && urlMatch) {
      let url = urlMatch[1];
      if (url.startsWith('/url?')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        url = urlParams.get('q') || url;
      }

      if (url.startsWith('http') && !url.includes('google.com/')) {
        results.push({
          title: stripTags(titleMatch[1]),
          url,
          duration: durationMatch ? durationMatch[1] : ''
        });
      }
    }
    if (results.length >= num) break;
  }

  return results;
}

module.exports = {
  googleSearch,
  googleImage,
  googleSuggest,
  googleTranslate,
  googleNews,
  googleVideo,
  getCookies,
  DEFAULT_COOKIES_FILE
};
