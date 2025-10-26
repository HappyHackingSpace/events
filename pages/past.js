import { Container, Box, Heading } from 'theme-ui'
import Month from '../components/month'
import { filter, groupBy, orderBy } from 'lodash'
import GHSlugger from 'github-slugger'

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
  // Past events için ayrı API endpoint kullan
  const response = await fetch('https://api.kommunity.com/api/v1/diyarbakir-happy-hacking-space/events/past')
  const data = await response.json()
  const slugger = new GHSlugger()
  
  let events = data.data?.map((event) => ({
    id: event.id,
    slug: slugger.slug(event.name || 'untitled'),
    title: event.name || 'Untitled Event',
    desc: event.detail || '',
    leader: event.latest_users?.[0]?.name || 'Happy Hacking Space',
    start: event.start_date?.date || new Date().toISOString(),
    end: event.end_date?.date || new Date().toISOString(),
    avatar: event.latest_users?.[0]?.avatar || 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/320/apple/81/shrug_1f937.png',
    location: event.venue?.name || 'Online'
  })) || []
  
  // En yeni tarihten eskiye doğru sırala
  events = orderBy(events, 'start', 'desc')
  
  let months = groupBy(events, e => e.start ? e.start.substring(0, 7) : 'unknown')

  Object.keys(months).forEach(
    (k, i) =>
      (months[k] = months[k].map(event => {
        return { ...event, desc: event.desc ?? null }
      }))
  )
  return { 
    props: { months }, 
    revalidate: process.env.NODE_ENV === 'development' ? false : 3600 // Development'ta cache yok, production'da 1 saat
  }
}
