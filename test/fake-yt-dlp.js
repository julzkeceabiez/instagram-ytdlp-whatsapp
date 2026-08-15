#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
if (args.includes('--dump-single-json')) {
  process.stdout.write(JSON.stringify({ id: 'fixture123', title: 'Fixture Reel', ext: 'mp4' }) + '\n')
  process.exit(0)
}

const outputIndex = args.indexOf('--output')
if (outputIndex < 0) process.exit(2)
const pattern = args[outputIndex + 1]
const playlist = args.includes('--yes-playlist')
const count = playlist ? 3 : 1
fs.mkdirSync(path.dirname(pattern), { recursive: true })
for (let index = 1; index <= count; index += 1) {
  const output = pattern
    .replace('%(title).180B', `Fixture Item ${index}`)
    .replace('%(id)s', `fixture${index}`)
    .replace('%(ext)s', args.includes('--extract-audio') ? 'mp3' : 'mp4')
  fs.writeFileSync(output, Buffer.from(`fixture media bytes ${index}`))
}
process.stdout.write(JSON.stringify({ id: 'fixture123', title: 'Fixture Item', ext: 'mp4' }) + '\n')
