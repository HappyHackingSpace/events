import { getEvents } from '../../../lib/data'

import { filter, groupBy } from 'lodash'

export const getUpcomingMonthly = async () => {
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
  return groupBy(events, e => {
    if (!e.start || typeof e.start !== 'string') return 'unknown'
    try {
      return e.start.substring(0, 7)
    } catch (error) {
      return 'unknown'
    }
  })
}

export default (req, res) => getUpcomingMonthly().then(m => res.json(m))
