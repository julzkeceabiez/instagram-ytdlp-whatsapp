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
const output = pattern.replace('%(title).180B', 'Fixture Reel').replace('%(id)s', 'fixture123').replace('%(ext)s', 'mp4')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, Buffer.from('fixture video bytes'))
process.stdout.write(JSON.stringify({ id: 'fixture123', title: 'Fixture Reel', ext: 'mp4' }) + '\n')
