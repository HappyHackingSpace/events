import { getEvents } from '../../../lib/data'
import { groupBy } from 'lodash'

export default async (req, res) => {
  const events = await getEvents()
  const months = groupBy(events, e => {
    if (!e.start || typeof e.start !== 'string') return 'unknown'
    try {
      return e.start.substring(0, 7)
    } catch (error) {
      return 'unknown'
    }
  })
  res.json(months)
}
