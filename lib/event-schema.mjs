// Shared event schema: parse/serialize the YAML-ish frontmatter used by
// content/events/<slug>.md, and map it to the event object the app renders.
//
// We deliberately own a tiny frontmatter (de)serializer instead of pulling in
// gray-matter/js-yaml: the frontmatter is ALWAYS a flat set of scalar values
// (string | boolean | null), produced only by our own tooling (the issue
// parser and the kommunity export), so a focused parser is smaller, dependency
// free, and avoids npm/yarn lockfile drift on Vercel.

export const DEFAULT_AVATAR =
  'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/320/apple/81/shrug_1f937.png'

// Dependency-free slug from a title (replaces github-slugger so the GitHub
// Action scripts need no npm install). Strips accents/emoji, lowercases,
// hyphenates. Uniqueness is handled by the callers (date/number suffixes).
export const slugify = str => {
  const s = String(str)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'event'
}

// Canonical frontmatter field order (kept stable for readable diffs).
export const FIELD_ORDER = [
  'slug',
  'title',
  'start',
  'end',
  'leader',
  'leaderUsername',
  'leaderUrl',
  'location',
  'ama',
  'isCanceled',
  'photo',
  'avatar',
  'youtube',
  'cal',
  'recurringId',
]

const escapeStr = s =>
  '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

const serializeValue = v => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  return escapeStr(v)
}

const parseValue = raw => {
  const t = raw.trim()
  if (t === '' || t === 'null' || t === '~') return null
  if (t === 'true') return true
  if (t === 'false') return false
  if (t[0] === '"') {
    // Quoted string: strip quotes, unescape \" and \\
    return t
      .slice(1, t.lastIndexOf('"'))
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  return t // bare scalar -> keep as string
}

// Split a raw file into { data, body }. Tolerant of a missing frontmatter block.
export const parseFrontmatter = raw => {
  const text = String(raw).replace(/^﻿/, '') // strip BOM
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: text.trim() }

  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    data[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1))
  }
  return { data, body: (match[2] || '').trim() }
}

// Build the full file contents from a fields object + markdown body.
export const serializeEvent = (fields, body = '') => {
  const keys = [
    ...FIELD_ORDER.filter(k => k in fields),
    ...Object.keys(fields).filter(k => !FIELD_ORDER.includes(k)),
  ]
  const lines = ['---']
  for (const k of keys) lines.push(`${k}: ${serializeValue(fields[k])}`)
  lines.push('---')
  return lines.join('\n') + '\n\n' + String(body).trim() + '\n'
}

// Map parsed frontmatter + body to the event object shape every page/api
// consumer expects (must stay in sync with the old kommunity mapping).
export const mapToEvent = (data, body, fallbackSlug) => {
  const slug = data.slug || fallbackSlug
  return {
    id: data.slug || fallbackSlug,
    slug,
    title: data.title || 'Untitled Event',
    desc: body || '',
    leader: data.leader || 'Happy Hacking Space',
    leaderUsername: data.leaderUsername || '',
    // Organizer profile on any platform. Back-compat: older events only have a
    // GitHub username, so derive the URL from it when leaderUrl isn't set.
    leaderUrl:
      data.leaderUrl ||
      (data.leaderUsername ? `https://github.com/${data.leaderUsername}` : ''),
    cal: data.cal || null,
    start: data.start || '',
    end: data.end || '',
    youtube: data.youtube || null,
    ama: !!data.ama,
    amaForm: false,
    amaId: '',
    amaAvatar: data.avatar || '',
    avatar: data.avatar || DEFAULT_AVATAR,
    approved: true,
    location: data.location || 'Online',
    isCanceled: !!data.isCanceled,
    photo: data.photo || null,
    recurringId: data.recurringId || null,
  }
}
