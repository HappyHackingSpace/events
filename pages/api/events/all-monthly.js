import { getEvents } from '../../../lib/data'
import { groupBy } from 'lodash'

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const events = await getEvents()
    const months = groupBy(events, e => {
      const start = e.start
      if (!start || typeof start !== 'string') {
        return 'unknown'
      }
      return String(start).slice(0, 7)
    })
    res.json(months)
  } catch (error) {
    console.error('Failed to fetch events:', error)
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to fetch events' 
    })
  }
}
