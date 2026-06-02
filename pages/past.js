import { Container, Box, Heading } from 'theme-ui'
import Month from '../components/month'
import { groupBy, orderBy } from 'lodash'
import { getEvents } from '../lib/data'

export default ({ months }) => (
  <>
    <Box
      as="header"
      sx={{
        bg: 'sheet',
        color: 'primary',
        textAlign: 'center',
        py: [3, 4],
        px: 3,
        mb: [3, 4]
      }}
    >
      <Heading as="h1" variant="title">
        Past Events
      </Heading>
    </Box>
    <Container>
      {Object.keys(months)
        .sort((a, b) => b.localeCompare(a))
        .map(key => (
          <Month key={key} month={key} events={months[key]} />
        ))}
    </Container>
  </>
)

export const getStaticProps = async () => {
  try {
    const now = new Date()
    let events = await getEvents()

    // Full archive: every event that has ended, excluding cancelled.
    events = events.filter(
      e => !e.isCanceled && e.end && typeof e.end === 'string' && new Date(e.end) < now
    )

    // Drop the large desc/HTML body — detail is fetched on the event page.
    // (Keeping it would push page data past Next's 128kB limit.)
    events = events.map(({ desc, ...rest }) => ({ ...rest, desc: null }))

    // Newest first, then group by month (YYYY-MM).
    events = orderBy(events, 'start', 'desc')
    const months = groupBy(events, e => (e.start ? e.start.substring(0, 7) : 'unknown'))

    return {
      props: { months },
      revalidate: process.env.NODE_ENV === 'development' ? false : 3600
    }
  } catch (error) {
    console.error('Failed to load past events:', error.message || error)

    // Return empty months object on error to prevent build failure
    return {
      props: { months: {} },
      revalidate: 300 // Retry more frequently on error (5 minutes)
    }
  }
}
