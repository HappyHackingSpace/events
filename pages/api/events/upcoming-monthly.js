import { getUpcoming } from '../../../lib/data'

import { groupBy } from 'lodash'

export const getUpcomingMonthly = async () => {
  // One-off future events + the next occurrence of each recurring series.
  const events = await getUpcoming()
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
