# Instagram Downloader untuk Bot WhatsApp

Downloader Instagram, YouTube, dan Pinterest untuk bot WhatsApp Node.js. Instagram dan YouTube memakai [`yt-dlp`](https://github.com/yt-dlp/yt-dlp), sedangkan Pinterest memakai HTTP fetch dengan cookies Netscape lokal. Paket ini berisi provider `scraper/instagram.js`, `scraper/youtube.js`, `scraper/pinterest.js`, serta handler command yang sesuai di folder `case/`.

> Gunakan hanya untuk media yang boleh Anda akses dan simpan. Modul ini tidak mengakali akun privat, login, CAPTCHA, DRM, atau pembatasan akses Instagram.

## Instalasi

Pastikan Node.js 18 atau lebih baru, `yt-dlp`, dan FFmpeg tersedia di server.

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y ffmpeg yt-dlp

# atau bila yt-dlp dipasang melalui pip
python3 -m pip install --user -U yt-dlp
```

Atur environment variable berikut bila diperlukan:

```bash
export YTDLP_BIN=yt-dlp
export INSTAGRAM_TMP_DIR=/tmp/instagram-downloader
export INSTAGRAM_MAX_BYTES=99614720
export INSTAGRAM_TIMEOUT_MS=120000
export YOUTUBE_TMP_DIR=/tmp/youtube-downloader
export YOUTUBE_MAX_BYTES=99614720
export YOUTUBE_TIMEOUT_MS=180000
```

Untuk YouTube, letakkan export cookies yang sah di lokasi berikut pada server bot:

```bash
mkdir -p library
cp /path/aman/cookies-youtube.txt library/cookies.txt
chmod 600 library/cookies.txt
```

Downloader otomatis membaca `library/cookies.txt`. Alternatifnya, Anda dapat mengatur `YTDLP_COOKIES` ke path lain. Jangan pernah commit, mengirim, atau membagikan file ini; cookies sesi harus diperlakukan seperti password.

Untuk Instagram atau deployment lain yang memakai path berbeda, gunakan `YTDLP_COOKIES=/secure/path/cookies.txt`. Semua path cookies bersifat lokal dan tidak dikirim ke repository.

Untuk Pinterest, letakkan export cookies Netscape yang sah di lokasi berikut pada server bot:

```bash
mkdir -p cookies
cp /path/aman/cookies-pinterest.txt cookies/cookiespin.txt
chmod 600 cookies/cookiespin.txt
```

Scraper Pinterest otomatis membaca `cookies/cookiespin.txt`. Alternatifnya, gunakan `PINTEREST_COOKIES=/secure/path/cookiespin.txt`. Jangan pernah commit atau membagikan cookie sesi.

## Integrasi case

Salin folder `scraper/` dan `case/` ke root bot. Pada dispatcher command, tambahkan:

```js
const { handleInstagramCase } = require('./case/instagram')
```

Kemudian pada switch command:

```js
case 'ig':
case 'igdl':
case 'instagram': {
  return handleInstagramCase({ alip, m, text, args, prefix, command, mode: 'video' })
}

case 'igfoto':
case 'igphoto': {
  return handleInstagramCase({ alip, m, text, args, prefix, command, mode: 'photo' })
}
```

Jika dispatcher Anda tidak menyediakan `args`, cukup kirim `text`. Handler akan mengambil URL pertama dari teks command.

Untuk YouTube, tambahkan pada dispatcher:

```js
const { handleYouTubeCase } = require('./case/youtube')

case 'ytmp4':
case 'ytvideo': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video' })
}

case 'ytmp3':
case 'ytaudio': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'audio' })
}

case 'ytall':
case 'ytplaylist': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video', playlist: true, maxItems: 20 })
}

case 'ytpost': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video', maxItems: 10 })
}

const { handlePinterestSearchCase, handlePinterestDownloadCase } = require('./case/pinterest')

case 'pinsearch':
case 'psearch': {
  return handlePinterestSearchCase({ alip, m, text, args, prefix, command, limit: 10 })
}

case 'pindl':
case 'pindownload': {
  return handlePinterestDownloadCase({ alip, m, text, args, prefix, command, maxItems: 10 })
}
```

Contoh penggunaan:

```text
.ig https://www.instagram.com/reel/XXXXXXXXXXX/
.igfoto https://www.instagram.com/p/XXXXXXXXXXX/
.ytmp4 720p https://www.youtube.com/watch?v=VIDEO_ID
.ytmp4 1080 https://www.youtube.com/watch?v=VIDEO_ID
.ytmp3 https://youtu.be/VIDEO_ID
.ytall https://www.youtube.com/playlist?list=PLAYLIST_ID
.ytpost https://www.youtube.com/post/POST_ID
.pinsearch aesthetic room
.pindl https://www.pinterest.com/pin/PIN_ID/
```

## Dukungan tipe URL, playlist, dan kualitas

Scraper menerima video YouTube biasa, Shorts, live atau replay, URL `youtu.be`, embed, clip, playlist, channel, handle `@`, YouTube Music, serta URL Community Post `/post/...`. Untuk Community Post, scraper mengambil media gambar asli dari halaman dan mengirim bytes asli tanpa resize, re-encode, atau kompresi. Dukungan aktual tetap mengikuti extractor dan kebijakan akses YouTube; scraper tidak melewati CAPTCHA, DRM, login, atau pembatasan akun.

`ytmp4` mengunduh satu video. `ytpost` menangani Community Post dan mengirim satu atau beberapa gambar asli. `ytall` atau `ytplaylist` mengaktifkan playlist dengan batas default 20 item agar bot tidak mengirim ratusan file tanpa sengaja. Batas tersebut dapat diubah melalui parameter `maxItems` pada integrasi case. Mode `ytmp3` mengekstrak audio MP3. Live yang sedang berlangsung dapat memerlukan waktu hingga selesai atau konfigurasi live khusus; replay yang sudah tersedia diproses seperti video biasa.

Pemilihan kualitas bersifat dinamis: gunakan `best`, `worst`, atau angka resolusi positif seperti `144p`, `360p`, `720p`, `1080p`, `1440p`, dan `2160p`. Angka tidak lagi dibatasi pada daftar hardcoded; `yt-dlp` memilih format yang tersedia sampai tinggi maksimum yang diminta. Contoh: `.ytmp4 720p URL`, `.ytmp4 best URL`, atau `.ytmp4 worst URL`. Jika format terpisah membutuhkan penggabungan audio-video, FFmpeg harus tersedia.

Command `.ytmp3` mengirim audio MP3, `.ig` mengirim video Instagram, dan `.igfoto` mengirim foto Instagram sebagai image WhatsApp.

## Pinterest Search dan Pin Downloader

Gunakan `.pinsearch kata kunci` untuk mencari pin. Handler mengembalikan URL pin yang ditemukan, kemudian `.pindl URL_PIN` mengunduh media pin sebagai gambar atau video. Jika sebuah pin memiliki beberapa media, semuanya dikirim secara berurutan sampai batas `maxItems`. Media Pinterest dikirim sebagai bytes asli tanpa resize, re-encode, atau kompresi.

Contoh:

```text
.pinsearch aesthetic room
.pindl https://www.pinterest.com/pin/123456789012345678/
```

Dukungan media dan hasil pencarian bergantung pada HTML publik, cookies yang sah, dan perubahan struktur Pinterest. Modul tidak melewati CAPTCHA, private content, atau pembatasan akses.

## Fitur keamanan dan stabilitas

Modul memvalidasi host, tidak menggunakan `shell: true`, memakai direktori temporary unik per request, menerapkan timeout dan batas ukuran, menghapus file saat selesai, serta tidak menaruh token atau isi cookies di source code. YouTube otomatis memakai `library/cookies.txt` bila file tersedia.

## Pengujian

```bash
npm run syntax
npm test
```

Test suite menggunakan fixture lokal, sehingga tidak mengakses Instagram nyata dan tidak memerlukan akun atau cookies. Smoke test dengan URL publik dapat dijalankan hanya pada lingkungan Anda sendiri setelah `yt-dlp` tersedia:

```bash
yt-dlp --version
yt-dlp --no-playlist --simulate 'https://www.instagram.com/reel/URL_PUBLIK/'
yt-dlp --no-playlist --simulate --cookies library/cookies.txt 'https://www.youtube.com/watch?v=URL_PUBLIK'
yt-dlp --yes-playlist --flat-playlist --playlist-end 3 --simulate 'https://www.youtube.com/playlist?list=URL_PUBLIK'
```

## Troubleshooting

Jika muncul pesan `yt-dlp belum terpasang`, pastikan binary berada di `PATH` atau set `YTDLP_BIN` ke path absolut. Jika YouTube meminta login atau video dibatasi usia, pastikan `library/cookies.txt` berasal dari akun Anda sendiri, belum kedaluwarsa, dan permission-nya `600`. Jika ukuran media terlalu besar untuk WhatsApp, turunkan format atau naikkan batas hanya jika server dan kebijakan pengiriman Anda mengizinkan.
