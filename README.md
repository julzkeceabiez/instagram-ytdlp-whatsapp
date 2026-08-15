# Instagram Downloader untuk Bot WhatsApp

Downloader Instagram berbasis [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) untuk bot WhatsApp Node.js. Paket ini berisi dua bagian: `scraper/instagram.js` sebagai provider downloader dan `case/instagram.js` sebagai handler command WhatsApp.

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
```

Untuk konten yang secara sah membutuhkan sesi login, gunakan file cookies lokal yang tidak dimasukkan ke repository:

```bash
export YTDLP_COOKIES=/secure/path/instagram-cookies.txt
chmod 600 /secure/path/instagram-cookies.txt
```

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
  return handleInstagramCase({
    alip,
    m,
    text,
    args,
    prefix,
    command
  })
}
```

Jika dispatcher Anda tidak menyediakan `args`, cukup kirim `text`. Handler akan mengambil URL pertama dari teks command.

Contoh penggunaan:

```text
.ig https://www.instagram.com/reel/XXXXXXXXXXX/
```

## Fitur keamanan dan stabilitas

Modul memvalidasi host Instagram, tidak menggunakan `shell: true`, memakai direktori temporary unik per request, menerapkan timeout dan batas ukuran, menghapus file saat selesai, serta tidak menaruh token atau cookies di source code. Default batas media adalah sekitar 95 MB dan dapat diubah melalui `INSTAGRAM_MAX_BYTES`.

## Pengujian

```bash
npm run syntax
npm test
```

Test suite menggunakan fixture lokal, sehingga tidak mengakses Instagram nyata dan tidak memerlukan akun atau cookies. Smoke test dengan URL publik dapat dijalankan hanya pada lingkungan Anda sendiri setelah `yt-dlp` tersedia:

```bash
yt-dlp --version
yt-dlp --no-playlist --simulate 'https://www.instagram.com/reel/URL_PUBLIK/'
```

## Troubleshooting

Jika muncul pesan `yt-dlp belum terpasang`, pastikan binary berada di `PATH` atau set `YTDLP_BIN` ke path absolut. Jika Instagram meminta login, jangan memasukkan cookies ke commit; set `YTDLP_COOKIES` ke file lokal dengan permission terbatas. Jika ukuran media terlalu besar untuk WhatsApp, turunkan format atau naikkan batas hanya jika server dan kebijakan pengiriman Anda mengizinkan.
