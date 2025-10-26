import { getEvents } from '../../../lib/data'

import { filter, groupBy } from 'lodash'

export const getUpcomingMonthly = async () => {
  let events = await getEvents()
  events = filter(
    events,
    e => {
      if (!e.end || typeof e.end !== 'string') return false
      return e.end.substring(0, 7) >= new Date().toISOString().substring(0, 7)
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
