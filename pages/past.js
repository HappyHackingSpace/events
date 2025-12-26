import { Container, Box, Heading } from 'theme-ui'
import Month from '../components/month'
import { filter, groupBy, orderBy } from 'lodash'
import GHSlugger from 'github-slugger'
import { fetchWithTimeout } from '../lib/data'

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
    // Use consistent fetchWithTimeout from lib/data.js
    const response = await fetchWithTimeout('https://api.kommunity.com/api/v1/diyarbakir-happy-hacking-space/events/past')
    const data = await response.json()
    const slugger = new GHSlugger()
    
    // Create lightweight events without large desc field to reduce payload size
    // The desc field can contain large HTML content that pushes page data over 128kB
    let events = data.data?.map((event) => ({
      id: event.id,
      slug: slugger.slug(event.name || 'untitled'),
      title: event.name || 'Untitled Event',
      // Remove desc field to reduce payload - details can be fetched on individual event pages
      leader: event.latest_users?.[0]?.name || 'Happy Hacking Space',
      leaderUsername: event.latest_users?.[0]?.username || '',
      start: event.start_date?.date || new Date().toISOString(),
      end: event.end_date?.date || new Date().toISOString(),
      avatar: event.latest_users?.[0]?.avatar || 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/320/apple/81/shrug_1f937.png',
      location: event.venue?.name || 'Online',
      isCanceled: event.is_canceled || false,
      photo: event.highlight_photo || null
    })) || []

    // Filter out cancelled events
    events = events.filter(e => !e.isCanceled)

    // Sort from newest to oldest
    events = orderBy(events, 'start', 'desc')
    
    // Group by month (YYYY-MM format)
    let months = groupBy(events, e => e.start ? e.start.substring(0, 7) : 'unknown')

    // Clean up months data - no need to process desc since we removed it
    Object.keys(months).forEach((monthKey) => {
      months[monthKey] = months[monthKey].map(event => ({
        ...event,
        // Ensure consistent data structure for the Month component
        desc: null // Explicitly set to null for consistency
      }))
    })
    
    return { 
      props: { months }, 
      revalidate: process.env.NODE_ENV === 'development' ? false : 3600
    }
  } catch (error) {
    console.error('Failed to fetch past events:', error.message || error)
    
    // Return empty months object on error to prevent build failure
    return {
      props: { months: {} },
      revalidate: 300 // Retry more frequently on error (5 minutes)
    }
  }
}
