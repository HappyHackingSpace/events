#!/usr/bin/env node
// Daily housekeeping (run by the roll-events workflow):
//   1. Any one-off event in upcoming/ that has ended  → move to past/.
//   2. Any recurring definition whose `next` occurrence has ended → snapshot
//      that occurrence into past/, then advance `next` by the cadence (looping
//      so missed days still get archived). The definition stays the single
//      upcoming entry; only passed occurrences become files.
//
// Idempotent: running it repeatedly with nothing due makes no changes.

import { readdir, readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter, serializeEvent } from '../lib/event-schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVENTS_DIR = join(ROOT, 'content', 'events')
const UPCOMING_DIR = join(EVENTS_DIR, 'upcoming')
const PAST_DIR = join(EVENTS_DIR, 'past')
const RECURRING_DIR = join(EVENTS_DIR, 'recurring')
const HOST = 'Happy Hacking Space'

const now = new Date()
const asDate = s => new Date(String(s).replace(' ', 'T'))
const fmt = d => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`
}
const addMinutes = (dateStr, mins) =>
  mins ? fmt(new Date(asDate(dateStr).getTime() + mins * 60000)) : dateStr
const advance = (dateStr, cadence) => {
  const d = asDate(dateStr)
  const c = String(cadence || '').toLowerCase()
  if (c.includes('year')) d.setFullYear(d.getFullYear() + 1)
  else if (c.includes('month')) d.setMonth(d.getMonth() + 1)
  else if (c.includes('3') || c.includes('three')) d.setDate(d.getDate() + 21)
  else if (c.includes('bi')) d.setDate(d.getDate() + 14)
  else d.setDate(d.getDate() + 7) // Weekly (default)
  return fmt(d)
}

const listMd = async dir => {
  try {
    return (await readdir(dir)).filter(f => f.endsWith('.md') && f !== 'README.md')
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}

const uniquePastPath = base => {
  let slug = base
  let n = 2
  while (existsSync(join(PAST_DIR, `${slug}.md`))) slug = `${base}-${n++}`
  return { slug, path: join(PAST_DIR, `${slug}.md`) }
}

const main = async () => {
  let moved = 0
  let snapshotted = 0

  // 1. Move ended one-off upcoming events into the archive.
  for (const file of await listMd(UPCOMING_DIR)) {
    const { data } = parseFrontmatter(await readFile(join(UPCOMING_DIR, file), 'utf8'))
    if (data.end && asDate(data.end) < now) {
      await rename(join(UPCOMING_DIR, file), join(PAST_DIR, file))
      moved++
      console.log(`→ archived ${file}`)
    }
  }

  // 2. Roll each recurring series forward.
  for (const file of await listMd(RECURRING_DIR)) {
    const defPath = join(RECURRING_DIR, file)
    const { data, body } = parseFrontmatter(await readFile(defPath, 'utf8'))
    const defSlug = data.slug || basename(file, '.md')
    const duration = data.durationMinutes != null ? Number(data.durationMinutes) : null
    let next = data.next
    let changed = false

    // While the current occurrence has already ended, snapshot it and advance.
    while (next && asDate(addMinutes(next, duration)) < now) {
      const { slug, path } = uniquePastPath(`${defSlug}-${String(next).slice(0, 10)}`)
      const occurrence = {
        slug,
        title: data.title,
        start: next,
        end: addMinutes(next, duration),
        leader: HOST,
        leaderUsername: '',
        location: data.location || 'Online',
        ama: !!data.ama,
        isCanceled: false,
        photo: data.photo || null,
        avatar: null,
        youtube: null,
        cal: null,
        recurringId: defSlug
      }
      await writeFile(path, serializeEvent(occurrence, body))
      snapshotted++
      console.log(`→ snapshot ${slug} (from ${data.title})`)
      next = advance(next, data.cadence)
      changed = true
    }

    if (changed) {
      await writeFile(defPath, serializeEvent({ ...data, next }, body))
      console.log(`→ ${data.title} next = ${next}`)
    }
  }

  console.log(`\n✓ archived ${moved} one-off events, snapshotted ${snapshotted} recurring occurrences`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
