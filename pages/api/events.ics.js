import { getEvents } from '../../lib/data'

// ICS format helper functions
const formatICSDate = (dateString) => {
  const date = new Date(dateString)
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
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
    'X-WR-TIMEZONE:Europe/Istanbul'
  ]

  events.forEach(event => {
    const startDate = formatICSDate(event.start)
    const endDate = formatICSDate(event.end)
    const uid = `${event.id}@happyhacking.space`
    const dtstamp = formatICSDate(new Date().toISOString())

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDate}`,
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
