import { filter } from 'lodash'
import { getEvents } from '../../../lib/data'

export default async (req, res) => {
  let events = await getEvents()
  // Filter out past and cancelled events
  events = filter(
    events,
    e => {
      if (!e.end || typeof e.end !== 'string') return true
      if (e.isCanceled) return false
      try {
        return new Date(e.end) >= new Date()
      } catch (error) {
        return true
      }
    }
  )
  res.json(events)
}
