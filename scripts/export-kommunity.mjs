#!/usr/bin/env node
// One-time migration: export every kommunity event into the folder structure
//   content/events/upcoming/   future occurrences (one-offs + next recurring)
//   content/events/past/       occurrences that have happened
//   content/events/recurring/  series definitions (the "cause")
// and cache images locally for later upload.
//
//   node scripts/export-kommunity.mjs               # write files + download images
//   node scripts/export-kommunity.mjs --no-images   # write files only
//
// Recurring handling: only the SOONEST future occurrence of each series is kept
// in upcoming/ — the daily roll-events workflow regenerates the rest over time.
// Photo/avatar fields keep kommunity URLs until you re-host the cached images.

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeEvent, slugify } from '../lib/event-schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVENTS_DIR = join(ROOT, 'content', 'events')
const UPCOMING_DIR = join(EVENTS_DIR, 'upcoming')
const PAST_DIR = join(EVENTS_DIR, 'past')
const RECURRING_DIR = join(EVENTS_DIR, 'recurring')
const IMAGES_DIR = join(ROOT, 'scripts', 'cached-images')
const MANIFEST_PATH = join(IMAGES_DIR, 'manifest.json')

const COMMUNITY = 'diyarbakir-happy-hacking-space'
const API = `https://api.kommunity.com/api/v1/${COMMUNITY}`
const DOWNLOAD_IMAGES = !process.argv.includes('--no-images')

const HOST = 'Happy Hacking Space'

// Cadence for the active recurring series (the ones with future occurrences).
const CADENCE = {
  'Open Source Fridays': 'Weekly',
  'Happy Hacker Hour': 'Monthly'
}

const fetchJSON = async url => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

const fetchAll = async status => {
  const out = []
  let page = 1
  let lastPage = 1
  do {
    const j = await fetchJSON(`${API}/events?status=${status}&page=${page}`)
    lastPage = j?.meta?.last_page || 1
    out.push(...(j?.data || []))
    page++
  } while (page <= lastPage && page <= 50)
  return out
}

const extFromUrl = url => {
  try {
    const e = extname(new URL(url).pathname).toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(e)) return e
  } catch {}
  return '.jpg'
}

const downloadFile = async (url, destPath) => {
  if (existsSync(destPath)) return
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

const durationMinutes = (start, end) => {
  const a = new Date(String(start).replace(' ', 'T'))
  const b = new Date(String(end).replace(' ', 'T'))
  const m = (b - a) / 60000
  return m > 0 && !isNaN(m) ? Math.round(m) : null
}

const main = async () => {
  console.log('→ fetching kommunity events (paginated)…')
  const [upcoming, past] = await Promise.all([fetchAll('upcoming'), fetchAll('past')])
  console.log(`  ${upcoming.length} upcoming + ${past.length} past`)

  const byId = new Map()
  for (const e of [...upcoming, ...past]) byId.set(e.id, e)
  const byOccurrence = new Map()
  for (const e of byId.values()) {
    const key = `${e.name}@@${e.start_date?.date}`
    if (!byOccurrence.has(key)) byOccurrence.set(key, e)
  }
  const events = [...byOccurrence.values()]
  console.log(`  ${events.length} unique events after dedup`)

  // Fresh re-seed: clear the three folders.
  for (const dir of [UPCOMING_DIR, PAST_DIR, RECURRING_DIR]) {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
  }
  if (DOWNLOAD_IMAGES) await mkdir(join(IMAGES_DIR, 'events'), { recursive: true })

  const now = new Date()
  const seenSlugs = new Set()

  // Build a normalized record per event.
  const records = events.map(event => {
    const baseSlug = event.slug || slugify(event.name || 'untitled')
    let slug = baseSlug
    let n = 2
    while (seenSlugs.has(slug)) slug = `${baseSlug}-${n++}`
    seenSlugs.add(slug)
    const start = event.start_date?.date || ''
    const end = event.end_date?.date || start
    return {
      event,
      slug,
      start,
      end,
      isPast: end ? new Date(String(end).replace(' ', 'T')) < now : false,
      recurringId: event.recurring_event_id != null ? String(event.recurring_event_id) : null,
      title: event.name || 'Untitled Event',
      photo: event.highlight_photo || null
    }
  })

  // The soonest future occurrence per recurring series becomes that series'
  // definition `next` — no occurrence file is written for future recurring
  // events (the definition IS the upcoming entry).
  const futureRecurringByTitle = {}
  for (const r of records) {
    if (!r.isPast && r.recurringId) {
      const cur = futureRecurringByTitle[r.title]
      if (!cur || new Date(r.start) < new Date(cur.start)) futureRecurringByTitle[r.title] = r
    }
  }

  const manifest = []
  let photoOk = 0
  let photoFail = 0
  let upCount = 0
  let pastCount = 0
  let skipped = 0

  for (const r of records) {
    // Future recurring occurrences aren't written as files — they're represented
    // by their series definition (and regenerated into past/ by the cron).
    if (!r.isPast && r.recurringId) {
      skipped++
      continue
    }

    let photoLocalPath = null
    if (DOWNLOAD_IMAGES && r.photo) {
      photoLocalPath = `events/${r.slug}${extFromUrl(r.photo)}`
      try {
        await downloadFile(r.photo, join(IMAGES_DIR, photoLocalPath))
        photoOk++
      } catch (err) {
        console.error(`  ! photo failed for ${r.slug}: ${err.message}`)
        photoLocalPath = null
        photoFail++
      }
    }

    const fields = {
      slug: r.slug,
      title: r.title,
      start: r.start,
      end: r.end,
      leader: HOST,
      leaderUsername: '',
      location: r.event.venue?.name || 'Online',
      ama: r.title.startsWith('AMA:'),
      isCanceled: !!r.event.is_canceled,
      photo: r.photo,
      avatar: null,
      youtube: null,
      cal: r.event.calendar_links?.google || null,
      recurringId: r.recurringId
    }

    const dir = r.isPast ? PAST_DIR : UPCOMING_DIR
    await writeFile(join(dir, `${r.slug}.md`), serializeEvent(fields, r.event.detail || ''))
    r.isPast ? pastCount++ : upCount++

    manifest.push({
      slug: r.slug,
      kommunityId: r.event.id,
      file: `content/events/${r.isPast ? 'past' : 'upcoming'}/${r.slug}.md`,
      photoOriginalUrl: r.photo,
      photoLocalPath
    })
  }

  // Recurring definitions for active series (those with a kept future occurrence).
  let defCount = 0
  for (const [title, r] of Object.entries(futureRecurringByTitle)) {
    const defSlug = slugify(title) || `series-${defCount}`
    const def = {
      slug: defSlug,
      title,
      location: r.event.venue?.name || 'Online',
      ama: title.startsWith('AMA:'),
      photo: r.photo,
      cadence: CADENCE[title] || 'Weekly',
      next: r.start,
      durationMinutes: durationMinutes(r.start, r.end) || 120
    }
    await writeFile(join(RECURRING_DIR, `${defSlug}.md`), serializeEvent(def, r.event.detail || ''))

    // Cache + manifest the definition's photo too, so the rehost step rewrites it.
    let photoLocalPath = null
    if (DOWNLOAD_IMAGES && r.photo) {
      photoLocalPath = `events/${defSlug}${extFromUrl(r.photo)}`
      try {
        await downloadFile(r.photo, join(IMAGES_DIR, photoLocalPath))
        photoOk++
      } catch {
        photoLocalPath = null
      }
    }
    manifest.push({
      slug: defSlug,
      kommunityId: r.event.id,
      file: `content/events/recurring/${defSlug}.md`,
      photoOriginalUrl: r.photo,
      photoLocalPath
    })
    defCount++
  }

  if (DOWNLOAD_IMAGES) await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')

  console.log('')
  console.log(`✓ upcoming/  ${upCount}`)
  console.log(`✓ past/      ${pastCount}`)
  console.log(`✓ recurring/ ${defCount} definitions (${Object.keys(futureRecurringByTitle).join(', ')})`)
  console.log(`✓ ${skipped} future recurring occurrences represented by definitions (not written as files)`)
  if (DOWNLOAD_IMAGES) {
    console.log(`✓ ${photoOk} photos cached (${photoFail} failed) → scripts/cached-images/events/`)
    console.log(`✓ manifest → scripts/cached-images/manifest.json`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
