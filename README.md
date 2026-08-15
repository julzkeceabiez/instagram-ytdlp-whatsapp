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

case 'ytall':
case 'ytplaylist': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video', playlist: true, maxItems: 20 })
}

case 'ytpost': {
  return handleYouTubeCase({ alip, m, text, args, prefix, command, mode: 'video', maxItems: 10 })
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
```

## Dukungan tipe URL, playlist, dan kualitas

Scraper menerima video YouTube biasa, Shorts, live atau replay, URL `youtu.be`, embed, clip, playlist, channel, handle `@`, YouTube Music, serta URL Community Post `/post/...`. Untuk Community Post, scraper mengambil media gambar asli dari halaman dan mengirim bytes asli tanpa resize, re-encode, atau kompresi. Dukungan aktual tetap mengikuti extractor dan kebijakan akses YouTube; scraper tidak melewati CAPTCHA, DRM, login, atau pembatasan akun.

`ytmp4` mengunduh satu video. `ytpost` menangani Community Post dan mengirim satu atau beberapa gambar asli. `ytall` atau `ytplaylist` mengaktifkan playlist dengan batas default 20 item agar bot tidak mengirim ratusan file tanpa sengaja. Batas tersebut dapat diubah melalui parameter `maxItems` pada integrasi case. Mode `ytmp3` mengekstrak audio MP3. Live yang sedang berlangsung dapat memerlukan waktu hingga selesai atau konfigurasi live khusus; replay yang sudah tersedia diproses seperti video biasa.

Pemilihan kualitas bersifat dinamis: gunakan `best`, `worst`, atau angka resolusi positif seperti `144p`, `360p`, `720p`, `1080p`, `1440p`, dan `2160p`. Angka tidak lagi dibatasi pada daftar hardcoded; `yt-dlp` memilih format yang tersedia sampai tinggi maksimum yang diminta. Contoh: `.ytmp4 720p URL`, `.ytmp4 best URL`, atau `.ytmp4 worst URL`. Jika format terpisah membutuhkan penggabungan audio-video, FFmpeg harus tersedia.

Command `.ytmp3` mengirim audio MP3, `.ig` mengirim video Instagram, dan `.igfoto` mengirim foto Instagram sebagai image WhatsApp.

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

## Integrasi TikTok

Scraper TikTok menggunakan `yt-dlp` dan mengikuti pola handler yang sama dengan fitur Instagram dan YouTube. Handler menerima dependency gate dari bot utama sehingga struktur `isRegistered`, `isCreator`, `checkLimit`, `addLimit`, `Reply`, reaction, status proses, pengiriman media, dan cleanup tetap kompatibel dengan pola case yang diberikan.

Letakkan cookies TikTok yang sah hanya di server lokal:

```bash
mkdir -p cookies
cp /path/aman/cookies-tiktok.txt cookies/cookiestt.txt
chmod 600 cookies/cookiestt.txt
```

File `cookies/cookiestt.txt` otomatis diabaikan Git. Alternatifnya, gunakan `TIKTOK_COOKIES=/path/aman/cookies-tiktok.txt`. Jangan commit atau membagikan cookies karena isinya setara dengan kredensial sesi.

Tambahkan handler pada dispatcher bot:

```js
const { handleTikTokCase } = require('./case/tiktok')

case 'tt':
case 'tiktok': {
  return handleTikTokCase({
    alip,
    m,
    text,
    args,
    prefix,
    command,
    isRegistered,
    isCreator,
    isPremium: global.isPrem?.(m.sender) || false,
    checkLimit,
    addLimit,
    Reply,
    example
  })
}

case 'ttmp3':
case 'ttaudio': {
  return handleTikTokCase({
    alip,
    m,
    text,
    args,
    prefix,
    command,
    mode: 'audio',
    isRegistered,
    isCreator,
    isPremium: global.isPrem?.(m.sender) || false,
    checkLimit,
    addLimit,
    Reply,
    example
  })
}
```

Contoh command:

```text
.tt https://www.tiktok.com/@username/video/VIDEO_ID
.ttmp3 https://www.tiktok.com/@username/video/VIDEO_ID
```

Pengujian TikTok menggunakan fixture lokal sehingga tidak mengakses akun atau cookies asli. Jalankan `npm run syntax` dan `npm test` sebelum deployment. Dukungan aktual mengikuti extractor TikTok pada versi `yt-dlp` yang terpasang; scraper tidak melewati CAPTCHA, DRM, pembatasan akun, atau konten privat.

### Mode media TikTok dan deteksi otomatis

Handler TikTok mendukung tiga mode pengiriman. Mode `video` mengirim video MP4, mode `audio` menggunakan `yt-dlp` dan FFmpeg untuk mengekstrak MP3, sedangkan mode `photo` mengirim hasil gambar sebagai `image` WhatsApp. Jika `autoDetect` aktif, metadata yt-dlp diperiksa terlebih dahulu untuk membedakan `video`, `photo`/slideshow, `live_photo`, dan `live_video`.

```text
.tt https://www.tiktok.com/@username/video/VIDEO_ID
.ttmp3 https://www.tiktok.com/@username/video/VIDEO_ID
.ttfoto https://www.tiktok.com/@username/video/VIDEO_ID
```

Untuk mengaktifkan deteksi pada case, gunakan `autoDetect: true` atau biarkan nilai default handler. Deteksi `photo` bergantung pada metadata yang dikembalikan extractor TikTok; handler tidak mengklaim dapat mengubah video biasa menjadi foto atau melewati pembatasan platform. Untuk mode audio, pastikan FFmpeg tersedia di server.
