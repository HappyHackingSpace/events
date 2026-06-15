import { getEvents } from '../../lib/data'

// ICS format helper functions
// UTC timestamp (YYYYMMDDTHHMMSSZ) — only for DTSTAMP, which is a real instant.
const formatICSDate = (dateString) => {
  const date = new Date(dateString)
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// Event times are stored as Europe/Istanbul wall-clock ("YYYY-MM-DD HH:MM:SS").
// Emit them verbatim (no trailing Z) and pair with TZID=Europe/Istanbul, rather
// than running them through `new Date()`, which interprets a naive string in the
// SERVER's zone — on Vercel that's UTC, shifting every event +3h.
const formatLocalICS = (dateString) => {
  const m = String(dateString)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '00'] = m
  return `${y}${mo}${d}T${h}${mi}${s}`
}

const escapeICSText = (text) => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

const generateICS = (events) => {
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Happy Hacking Space//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Happy Hacking Space Events',
    'X-WR-CALDESC:AMAs, show & tells, & weekly fun in the Happy Hacking Space community',
    'X-WR-TIMEZONE:Europe/Istanbul',
    // VTIMEZONE fallback for clients that don't carry their own tz database.
    // Türkiye has been on permanent +03 (no DST) since September 2016.
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Istanbul',
    'BEGIN:STANDARD',
    'DTSTART:20161002T010000',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0300',
    'TZNAME:+03',
    'END:STANDARD',
    'END:VTIMEZONE'
  ]

  events.forEach(event => {
    const startLocal = formatLocalICS(event.start)
    const endLocal = formatLocalICS(event.end)
    const uid = `${event.id}@happyhacking.space`
    const dtstamp = formatICSDate(new Date().toISOString())

    // Fall back to UTC formatting only if the stored value isn't a parseable
    // local wall-clock string (shouldn't happen with our content schema).
    const dtStart = startLocal
      ? `DTSTART;TZID=Europe/Istanbul:${startLocal}`
      : `DTSTART:${formatICSDate(event.start)}`
    const dtEnd = endLocal
      ? `DTEND;TZID=Europe/Istanbul:${endLocal}`
      : `DTEND:${formatICSDate(event.end)}`

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      dtStart,
      dtEnd,
      `SUMMARY:${escapeICSText(event.title)}`,
      `DESCRIPTION:${escapeICSText(event.desc || '')}`,
      `LOCATION:${escapeICSText(event.location || 'Online')}`,
      `ORGANIZER;CN=Happy Hacking Space:MAILTO:info@happyhacking.space`,
      `URL:https://happyhacking.space/events/${event.slug}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    )
  })

  icsLines.push('END:VCALENDAR')
  return icsLines.join('\r\n')
}

export default async (req, res) => {
  try {
    const events = await getEvents()
    const icsContent = generateICS(events)

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="happy-hacking-space-events.ics"')
    res.setHeader('Cache-Control', 'public, max-age=3600') // 1 saat cache
    
    res.status(200).send(icsContent)
  } catch (error) {
    console.error('ICS Generation Error:', error)
    res.status(500).json({ error: 'Failed to generate calendar file' })
  }
}
