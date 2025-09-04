import GHSlugger from 'github-slugger'
import { orderBy } from 'lodash'

export const getEvents = async () => {
  const slugger = new GHSlugger()
  
  try {
    const response = await fetch('https://api.kommunity.com/api/v1/diyarbakir-happy-hacking-space/events')
    const data = await response.json()
    
    const events = data.data?.map((event) => ({
      id: event.id,
      slug: slugger.slug(event.name || 'untitled'),
      title: event.name || 'Untitled Event',
      desc: event.detail || '',
      leader: event.latest_users?.[0]?.name || 'Happy Hacking Space',
      cal: event.calendar_links?.google || null,
      start: event.start_date?.date || new Date().toISOString(),
      end: event.end_date?.date || new Date().toISOString(),
      youtube: null,
      ama: false,
      amaForm: false,
      amaId: '',
      amaAvatar: event.latest_users?.[0]?.avatar || '',
      avatar: event.latest_users?.[0]?.avatar || 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/320/apple/81/shrug_1f937.png',
      approved: true,
      location: event.venue?.name || 'Online'
    })) || []
    
    return orderBy(events, 'start')
  } catch (error) {
    console.error('API Error:', error)
    return []
  }
}
