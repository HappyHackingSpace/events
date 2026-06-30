#!/usr/bin/env node
// Turn a GitHub issue into an event change. Run by the event-from-issue workflow.
// Two issue templates feed this one script:
//   • "New event"            → CREATE  (one-off in upcoming/, or a recurring/ definition)
//   • "Update / cancel event"→ UPDATE or CANCEL an existing event by slug/URL
//
// Input  (env): ISSUE_BODY, ISSUE_TITLE, ISSUE_NUMBER
// Output (env): appends `slug=`, `path=`, `summary=` to $GITHUB_OUTPUT
// Exits non-zero with a human-readable message on bad input.

import { readdir, writeFile, mkdir, readFile, unlink } from 'node:fs/promises'
import { existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter, serializeEvent, slugify } from '../lib/event-schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVENTS_DIR = join(ROOT, 'content', 'events')
const UPCOMING_DIR = join(EVENTS_DIR, 'upcoming')
const PAST_DIR = join(EVENTS_DIR, 'past')
const RECURRING_DIR = join(EVENTS_DIR, 'recurring')

const NO_RESPONSE = '_No response_'

const parseIssueForm = body => {
  const sections = {}
  const parts = String(body || '').split(/^###[ \t]+/m)
  for (const part of parts) {
    if (!part.trim()) continue
    const nl = part.indexOf('\n')
    if (nl === -1) continue
    const label = part.slice(0, nl).trim().toLowerCase()
    let value = part.slice(nl + 1).trim()
    if (value === NO_RESPONSE) value = ''
    sections[label] = value
  }
  return sections
}

const firstUrl = s => {
  if (!s) return null
  // GitHub renders large pasted images as <img src="URL" …>; also handle
  // markdown ![alt](URL); else any bare URL. Strip trailing quotes/brackets.
  const img = s.match(/<img[^>]*?\ssrc=["']([^"']+)["']/i)
  const md = !img && s.match(/\]\((https?:\/\/[^)\s]+)\)/)
  const bare = !img && !md && s.match(/https?:\/\/[^\s)<>"']+/)
  const url = (img && img[1]) || (md && md[1]) || (bare && bare[0]) || null
  return url ? url.replace(/["'>)\]]+$/, '') : null
}

const normalizeDateTime = raw => {
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '00'] = m
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

// "Repeats" selection -> canonical cadence (null = one-time). Order matters.
const cadenceOf = raw => {
  const r = String(raw || '').toLowerCase()
  if (!r || r.startsWith('no')) return null
  if (r.includes('year')) return 'Yearly'
  if (r.includes('month')) return 'Monthly'
  if (r.includes('3') || r.includes('three')) return 'Every 3 weeks'
  if (r.includes('bi')) return 'Biweekly'
  if (r.includes('week')) return 'Weekly'
  return null
}

// "Repeat until" -> YYYY-MM-DD (date only) or null. Tolerates a full datetime.
const normalizeUntil = raw => {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// "Organizer link" -> full profile URL on any platform (X, Instagram, LinkedIn,
// Mastodon, Bluesky, GitHub, personal site), or ''. A bare handle is treated as
// GitHub for back-compat with the old "Organizer GitHub username" field.
const normalizeLink = raw => {
  const t = String(raw || '').trim().split(/\s+/)[0]
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`
  return `https://github.com/${t.replace(/^@/, '')}`
}

// Pull the GitHub username out of a github.com URL (for the legacy
// leaderUsername field), or '' if the link isn't GitHub.
const githubUserFromUrl = url => {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)/i.exec(url || '')
  return m ? m[1] : ''
}

const durationMin = (start, end) => {
  const a = new Date(String(start).replace(' ', 'T'))
  const b = new Date(String(end).replace(' ', 'T'))
  const m = (b - a) / 60000
  return m > 0 && !isNaN(m) ? Math.round(m) : 120
}

// slug from a pasted URL or bare slug ("https://…/open-source-fridays/" -> "open-source-fridays")
const slugFromRef = raw =>
  String(raw || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.md$/, '') || ''

const readSlugs = async dir => {
  try {
    return (await readdir(dir)).map(n => n.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

const findTarget = slug => {
  for (const [kind, dir] of [['upcoming', UPCOMING_DIR], ['past', PAST_DIR], ['recurring', RECURRING_DIR]]) {
    const path = join(dir, `${slug}.md`)
    if (existsSync(path)) return { kind, path }
  }
  return null
}

const fail = msg => {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

const emit = (slug, path, summary) => {
  console.log(`✓ ${summary}: ${path}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\npath=${path}\nsummary=${summary}\n`)
  }
}

// ---------- CREATE ----------
const create = async f => {
  const title = (f['event title'] || process.env.ISSUE_TITLE || '').trim()
  if (!title) fail('Missing required field: Event title')
  const start = normalizeDateTime(f['start'])
  if (!start) fail('Missing/invalid Start — expected "YYYY-MM-DD HH:MM" (Europe/Istanbul)')
  const end = normalizeDateTime(f['end']) || start

  const body = f['description'] || ''
  const location = (f['location'] || 'Online').trim()
  const ama = /^y/i.test(f['is this an ama?'] || '')
  const photo = firstUrl(f['cover image'])
  const cadence = cadenceOf(f['repeats'])
  const until = normalizeUntil(f['repeat until'])
  const leaderUrl = normalizeLink(f['organizer link'])

  if (cadence) {
    await mkdir(RECURRING_DIR, { recursive: true })
    const existing = new Set(await readSlugs(RECURRING_DIR))
    let slug = slugify(title)
    let n = 2
    while (existing.has(slug)) slug = `${slugify(title)}-${n++}`
    const def = {
      slug, title,
      leader: (f['organizer name'] || 'Happy Hacking Space').trim(),
      leaderUsername: githubUserFromUrl(leaderUrl),
      leaderUrl,
      location, ama, photo, cadence, next: start, durationMinutes: durationMin(start, end),
    }
    if (until) def.until = until
    await writeFile(join(RECURRING_DIR, `${slug}.md`), serializeEvent(def, body))
    return emit(slug, `content/events/recurring/${slug}.md`, `Created recurring series (${cadence})`)
  }

  await mkdir(UPCOMING_DIR, { recursive: true })
  const existing = new Set([...(await readSlugs(UPCOMING_DIR)), ...(await readSlugs(PAST_DIR))])
  let slug = slugify(title)
  if (existing.has(slug)) slug = `${slugify(title)}-${start.slice(0, 10)}`
  if (existing.has(slug)) slug = `${slugify(title)}-${process.env.ISSUE_NUMBER || Date.now()}`
  const fields = {
    slug, title, start, end,
    leader: (f['organizer name'] || 'Happy Hacking Space').trim(),
    leaderUsername: githubUserFromUrl(leaderUrl),
    leaderUrl,
    location, ama, isCanceled: false, photo, avatar: null,
    youtube: firstUrl(f['youtube url']), cal: null, recurringId: null
  }
  await writeFile(join(UPCOMING_DIR, `${slug}.md`), serializeEvent(fields, body))
  emit(slug, `content/events/upcoming/${slug}.md`, 'Created event')
}

// ---------- UPDATE / CANCEL ----------
const manage = async (f, slug) => {
  const target = findTarget(slug)
  if (!target) fail(`No event found with slug "${slug}" (looked in upcoming/, past/, recurring/).`)
  const action = String(f['action'] || '').toLowerCase()
  const rel = target.path.slice(ROOT.length + 1)
  const { data, body } = parseFrontmatter(await readFile(target.path, 'utf8'))

  if (action.includes('cancel')) {
    if (target.kind === 'recurring') {
      await unlink(target.path) // end the series; past occurrences stay archived
      return emit(slug, rel, 'Ended recurring series')
    }
    data.isCanceled = true
    await writeFile(target.path, serializeEvent(data, body))
    return emit(slug, rel, 'Cancelled event')
  }

  // UPDATE: override only the fields that were provided.
  const newTitle = (f['event title'] || '').trim()
  const newStart = normalizeDateTime(f['start'])
  const newEnd = normalizeDateTime(f['end'])
  const newLocation = (f['location'] || '').trim()
  const newPhoto = firstUrl(f['cover image'])
  const newCadence = cadenceOf(f['repeats'])
  const newUntil = normalizeUntil(f['repeat until'])
  const newLink = normalizeLink(f['organizer link'])
  const newBody = (f['description'] || '').trim()

  if (newTitle) data.title = newTitle
  if (newLocation) data.location = newLocation
  if (newPhoto) data.photo = newPhoto
  if (newLink) {
    data.leaderUrl = newLink
    data.leaderUsername = githubUserFromUrl(newLink)
  }

  if (target.kind === 'recurring') {
    if (newStart) data.next = newStart
    if (newCadence) data.cadence = newCadence
    if (newStart && newEnd) data.durationMinutes = durationMin(newStart, newEnd)
    if (newUntil) data.until = newUntil
  } else {
    if (newStart) data.start = newStart
    if (newEnd) data.end = newEnd
    if (firstUrl(f['youtube url'])) data.youtube = firstUrl(f['youtube url'])
  }

  await writeFile(target.path, serializeEvent(data, newBody || body))
  emit(slug, rel, 'Updated event')
}

const main = async () => {
  const f = parseIssueForm(process.env.ISSUE_BODY)
  const ref = f['existing event'] || f['existing event (link or slug)'] || ''
  if (ref) {
    const slug = slugFromRef(ref)
    if (!slug) fail('Could not read the existing event slug/URL.')
    await manage(f, slug)
  } else {
    await create(f)
  }
}

main().catch(err => fail(err.message || String(err)))
