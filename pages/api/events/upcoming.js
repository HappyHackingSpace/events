import { getUpcoming } from '../../../lib/data'

// Mirrors the homepage: one-off future events + the next occurrence of each
// recurring series (with cadence labels).
export default async (req, res) => {
  res.json(await getUpcoming())
}
