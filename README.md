# Instagram Downloader untuk Bot WhatsApp

Downloader Instagram dan YouTube berbasis [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) untuk bot WhatsApp Node.js. Paket ini berisi provider `scraper/instagram.js` dan `scraper/youtube.js`, serta handler command `case/instagram.js` dan `case/youtube.js`.

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
```

Contoh penggunaan:

```text
.ig https://www.instagram.com/reel/XXXXXXXXXXX/
.igfoto https://www.instagram.com/p/XXXXXXXXXXX/
.ytmp4 720p https://www.youtube.com/watch?v=VIDEO_ID
.ytmp4 1080 https://www.youtube.com/watch?v=VIDEO_ID
.ytmp3 https://youtu.be/VIDEO_ID
```

## Pilihan kualitas dan tipe media

YouTube video mendukung kualitas maksimum `144p`, `240p`, `360p`, `480p`, `720p`, `1080p`, `1440p`, dan `2160p`. Format kualitas ditulis sebelum atau sesudah URL, misalnya `.ytmp4 720p URL`. Jika kualitas yang diminta tidak tersedia, yt-dlp memilih fallback yang tersedia sampai batas tersebut. Command `.ytmp3` mengirim audio MP3, `.ig` mengirim video Instagram, dan `.igfoto` mengirim foto Instagram sebagai image WhatsApp.

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
```

## Troubleshooting

Jika muncul pesan `yt-dlp belum terpasang`, pastikan binary berada di `PATH` atau set `YTDLP_BIN` ke path absolut. Jika YouTube meminta login atau video dibatasi usia, pastikan `library/cookies.txt` berasal dari akun Anda sendiri, belum kedaluwarsa, dan permission-nya `600`. Jika ukuran media terlalu besar untuk WhatsApp, turunkan format atau naikkan batas hanya jika server dan kebijakan pengiriman Anda mengizinkan.
