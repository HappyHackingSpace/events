import { orderBy } from 'lodash'
import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { parseFrontmatter, mapToEvent } from './event-schema.mjs'

// Events live as markdown files organised by status. The site is its own source
// of truth — no external API at runtime.
//   content/events/upcoming/   future occurrences (one-offs + next recurring)
//   content/events/past/       occurrences that have happened
//   content/events/recurring/  series DEFINITIONS (the "cause"), not events
const EVENTS_DIR = join(process.cwd(), 'content', 'events')
export const UPCOMING_DIR = join(EVENTS_DIR, 'upcoming')
export const PAST_DIR = join(EVENTS_DIR, 'past')
export const RECURRING_DIR = join(EVENTS_DIR, 'recurring')

const readMdDir = async dir => {
  let files
  try {
    files = await readdir(dir)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const md = files.filter(f => f.endsWith('.md') && f !== 'README.md')
  return Promise.all(
    md.map(async file => {
      const raw = await readFile(join(dir, file), 'utf8')
      return { file: basename(file, '.md'), ...parseFrontmatter(raw) }
    })
  )
}

const addMinutes = (dateStr, mins) => {
  const d = new Date(String(dateStr).replace(' ', 'T'))
  if (isNaN(d) || !mins) return dateStr
  const e = new Date(d.getTime() + mins * 60000)
  const p = n => String(n).padStart(2, '0')
  return `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())} ${p(e.getHours())}:${p(e.getMinutes())}:00`
}

// Recurring series definitions — the editable template that "causes" a series,
// AND its single upcoming entry (no duplicate copy lives in upcoming/).
// frontmatter: title, cadence ("Weekly"/"Monthly"), next ("YYYY-MM-DD HH:MM:SS"
// — the upcoming occurrence), durationMinutes, location, photo, ama.
export const getRecurringDefinitions = async () => {
  const entries = await readMdDir(RECURRING_DIR)
  return entries.map(({ data, body, file }) => ({
    slug: data.slug || file,
    title: data.title || file,
    cadence: data.cadence || null,
    next: data.next || null,
    durationMinutes: data.durationMinutes != null ? Number(data.durationMinutes) : null,
    // (no `time` field — the time-of-day is encoded in `next`)
    location: data.location || 'Online',
    photo: data.photo || null,
    ama: !!data.ama,
    description: body || ''
  }))
}

// Render a recurring definition as a virtual upcoming event (no file on disk).
const definitionToEvent = def => {
  if (!def.next) return null
  const end = addMinutes(def.next, def.durationMinutes)
  const ev = mapToEvent(
    {
      slug: def.slug,
      title: def.title,
      start: def.next,
      end,
      location: def.location,
      ama: def.ama,
      photo: def.photo,
      recurringId: def.slug
    },
    def.description,
    def.slug
  )
  ev.cadence = def.cadence || null
  return ev
}

// Every event the site knows about: materialized occurrences (upcoming one-offs
// + past archive) PLUS each recurring series' virtual next occurrence. This is
// what the UI and every API endpoint read, so they always agree.
export const getEvents = async () => {
  const [upcoming, past, definitions] = await Promise.all([
    readMdDir(UPCOMING_DIR),
    readMdDir(PAST_DIR),
    getRecurringDefinitions()
  ])
  const fromFiles = [...upcoming, ...past].map(({ data, body, file }) =>
    mapToEvent(data, body, file)
  )
  const fromDefs = definitions.map(definitionToEvent).filter(Boolean)

  const unique = Array.from(new Map([...fromFiles, ...fromDefs].map(e => [e.slug, e])).values())
  return orderBy(unique, 'start')
}

// UPCOMING = everything not yet ended (one-off upcoming files + the virtual next
// of each recurring series). The "one entry per series" is now structural — one
// definition → one virtual event — so there's nothing to de-duplicate.
export const getUpcoming = async () => {
  const now = new Date()
  return (await getEvents()).filter(
    e => !e.isCanceled && e.end && typeof e.end === 'string' && new Date(e.end) >= now
  )
}
