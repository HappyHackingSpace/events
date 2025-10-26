import { filter } from 'lodash'
import { getEvents } from '../../../lib/data'

export default async (req, res) => {
  let events = await getEvents()
  // Filter out events from previous months
  events = filter(
    events,
    e => {
      if (!e.end || typeof e.end !== 'string') return true
      try {
        return new Date(new Date(e.end.substring(0, 7)).toISOString().substring(0, 7)) >=
               new Date(new Date().toISOString().substring(0, 7))
      } catch (error) {
        return true
      }
    }
  )
  res.json(events)
}
