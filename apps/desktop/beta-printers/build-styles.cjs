// Compile once for distribution: the Electron window needs no CDN, network or Node APIs.
const fs = require('node:fs/promises')
const path = require('node:path')
const postcss = require('postcss')
const tailwind = require('@tailwindcss/postcss')
async function build() {
  const from = path.join(__dirname, 'tailwind.css')
  const to = path.join(__dirname, 'style.css')
  const result = await postcss([tailwind({ base: __dirname, optimize: true })]).process(await fs.readFile(from, 'utf8'), { from, to })
  await fs.writeFile(to, result.css)
  for (const warning of result.warnings()) process.stderr.write(warning.toString() + '\n')
}
build().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
