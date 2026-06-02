#!/usr/bin/env node
// Re-host the migrated kommunity images on GitHub, in two steps around the one
// manual action GitHub forces on us (attachment upload = browser-only).
//
//   1) node scripts/export-kommunity.mjs            # download images + manifest
//   2) node scripts/rehost-images.mjs prepare       # dedup -> cached-images/upload/
//        → drag every file from cached-images/upload/ into ONE GitHub issue
//          comment, then paste that comment's markdown into:
//            scripts/cached-images/uploaded.md
//   3) node scripts/rehost-images.mjs apply         # rewrite photo:/avatar: links
//
// Dedup is by content hash, so identical reused posters upload only once. The
// uploaded markdown is `![<hash>](url)` (GitHub uses the filename as alt text),
// and <hash> is exactly how we map each URL back to every event that uses it.

import { readFile, writeFile, readdir, mkdir, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter, serializeEvent } from '../lib/event-schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_DIR = join(ROOT, 'content', 'events')
const IMAGES_DIR = join(ROOT, 'scripts', 'cached-images')
const MANIFEST_PATH = join(IMAGES_DIR, 'manifest.json')
const UPLOAD_DIR = join(IMAGES_DIR, 'upload')
const UPLOAD_MAP_PATH = join(IMAGES_DIR, 'upload-map.json')
const UPLOADED_MD_PATH = join(IMAGES_DIR, 'uploaded.md')

const die = msg => { console.error(`✖ ${msg}`); process.exit(1) }
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16)

const loadManifest = async () => {
  if (!existsSync(MANIFEST_PATH)) {
    die('No manifest.json. Run `node scripts/export-kommunity.mjs` first (with image download).')
  }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
}

// ---- prepare: hash + dedup local images into upload/ ----
const prepare = async () => {
  const manifest = await loadManifest()
  await rm(UPLOAD_DIR, { recursive: true, force: true })
  await mkdir(UPLOAD_DIR, { recursive: true })

  // (slug, kind) -> local file path, for every image we actually downloaded.
  const entries = []
  for (const m of manifest) {
    if (m.photoLocalPath) entries.push({ slug: m.slug, kind: 'photo', path: join(IMAGES_DIR, m.photoLocalPath) })
    if (m.avatarLocalPath) entries.push({ slug: m.slug, kind: 'avatar', path: join(IMAGES_DIR, m.avatarLocalPath) })
  }

  const map = { photo: {}, avatar: {} } // slug -> hash
  const repByHash = new Map() // hash -> filename
  let missing = 0
  let idx = 0

  for (const e of entries) {
    if (!existsSync(e.path)) { missing++; continue }
    const buf = await readFile(e.path)
    const hash = sha(buf)
    const ext = extname(e.path) || '.jpg'
    map[e.kind][e.slug] = hash
    if (!repByHash.has(hash)) {
      // Ordered, numbered name with the hash embedded: easy to upload "one by
      // one", and `apply` recovers the hash (the mapping key) from the alt text.
      idx++
      const name = `${String(idx).padStart(3, '0')}-${hash}${ext}`
      repByHash.set(hash, name)
      await copyFile(e.path, join(UPLOAD_DIR, name))
    }
  }

  await writeFile(UPLOAD_MAP_PATH, JSON.stringify(map, null, 2) + '\n')

  const totalRefs = entries.length - missing
  console.log(`✓ ${totalRefs} image references → ${repByHash.size} UNIQUE files to upload`)
  if (missing) console.log(`  (${missing} referenced files were not on disk; re-run the export)`)
  console.log(`\nNext:`)
  console.log(`  1. Open a GitHub issue, drag EVERY file from scripts/cached-images/upload/ into the comment box.`)
  console.log(`  2. Copy the whole comment markdown and save it to: scripts/cached-images/uploaded.md`)
  console.log(`  3. Run: node scripts/rehost-images.mjs apply`)
}

// ---- apply: rewrite frontmatter photo/avatar from the pasted markdown ----
const apply = async () => {
  if (!existsSync(UPLOAD_MAP_PATH)) die('No upload-map.json. Run `prepare` first.')
  if (!existsSync(UPLOADED_MD_PATH)) die(`No ${UPLOADED_MD_PATH}. Paste the GitHub comment markdown there first.`)

  const map = JSON.parse(await readFile(UPLOAD_MAP_PATH, 'utf8'))
  const pasted = await readFile(UPLOADED_MD_PATH, 'utf8')

  // Parse `![alt](url)`, `[alt](url)`, and <img src alt> — alt is the filename (hash).
  const hashToUrl = {}
  const re = /!?\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|<img[^>]*?src="(https?:\/\/[^"]+)"[^>]*?alt="([^"]*)"/g
  let mm
  while ((mm = re.exec(pasted))) {
    const alt = mm[1] ?? mm[4] ?? ''
    const url = mm[2] ?? mm[3]
    // The filename embeds the content hash (e.g. "001-a1b2c3d4e5f60718"); pull it out.
    const hash = (alt.match(/[0-9a-f]{16}/) || [])[0]
    if (hash && url) hashToUrl[hash] = url
  }
  if (!Object.keys(hashToUrl).length) die('Found no image links in uploaded.md.')

  // slug -> { photo?: url, avatar?: url }
  const perSlug = {}
  for (const kind of ['photo', 'avatar']) {
    for (const [slug, hash] of Object.entries(map[kind])) {
      const url = hashToUrl[hash]
      if (url) (perSlug[slug] ||= {})[kind] = url
    }
  }

  let filesUpdated = 0
  let photos = 0
  let avatars = 0
  const unmatched = []
  for (const m of JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))) {
    const upd = perSlug[m.slug]
    // Resolve via the manifest's recorded path (events live in upcoming/, past/,
    // or recurring/), falling back to a flat path for older manifests.
    const file = m.file ? join(ROOT, m.file) : join(CONTENT_DIR, `${m.slug}.md`)
    if (!upd || !existsSync(file)) {
      if (m.photoLocalPath && !upd?.photo) unmatched.push(m.slug)
      continue
    }
    const { data, body } = parseFrontmatter(await readFile(file, 'utf8'))
    if (upd.photo) { data.photo = upd.photo; photos++ }
    if (upd.avatar) { data.avatar = upd.avatar; avatars++ }
    await writeFile(file, serializeEvent(data, body))
    filesUpdated++
  }

  console.log(`✓ updated ${filesUpdated} files — ${photos} photos, ${avatars} avatars rewritten`)
  if (unmatched.length) {
    console.log(`⚠ ${unmatched.length} events still have no new photo (hash not found in uploaded.md):`)
    console.log('  ' + unmatched.slice(0, 20).join(', ') + (unmatched.length > 20 ? ' …' : ''))
  }
}

const cmd = process.argv[2]
if (cmd === 'prepare') prepare().catch(e => die(e.message))
else if (cmd === 'apply') apply().catch(e => die(e.message))
else die('Usage: node scripts/rehost-images.mjs <prepare|apply>')
