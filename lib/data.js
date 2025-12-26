import GHSlugger from 'github-slugger'
import { orderBy } from 'lodash'


const DEFAULT_TIMEOUT_MS = 20_000
const MAX_RETRIES = 3

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const fetchWithTimeout = async (url, options = {}, timeoutMs = null, retries = MAX_RETRIES) => {
  const timeout = timeoutMs ?? parseInt(process.env.FETCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS, 10)
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`HTTP ${response.status}: Failed to fetch from ${url}`)
        }
        
        if (attempt < retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000) // Cap at 10s
          const jitter = Math.random() * 1000 
          console.warn(`Retrying request to ${url} after ${response.status} error (attempt ${attempt + 1}/${retries + 1})`)
          await sleep(backoffMs + jitter)
          continue
        }
        
        throw new Error(`HTTP ${response.status}: Failed to fetch from ${url}`)
      }
      
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (attempt >= retries) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout: Failed to fetch from ${url} within ${timeout}ms`)
        }
        throw error
      }
      
      if (error.name === 'AbortError' || error.name === 'TypeError' || error.message?.includes('fetch')) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
        const jitter = Math.random() * 1000
        console.warn(`Retrying request to ${url} after ${error.name || 'network error'} (attempt ${attempt + 1}/${retries + 1})`)
        await sleep(backoffMs + jitter)
        continue
      }
      
      throw error
    }
  }
}

export const getEvents = async (timeoutMs = null) => {
  const slugger = new GHSlugger()
  
  try {
    // Fetch both upcoming and past events
    const [upcomingResponse, pastResponse] = await Promise.all([
      fetchWithTimeout(
        'https://api.kommunity.com/api/v1/diyarbakir-happy-hacking-space/events',
        {},
        timeoutMs
      ),
      fetchWithTimeout(
        'https://api.kommunity.com/api/v1/diyarbakir-happy-hacking-space/events/past',
        {},
        timeoutMs
      )
    ])
    
    const upcomingData = await upcomingResponse.json()
    const pastData = await pastResponse.json()
    
    const mapEvent = (event) => ({
      id: event.id,
      slug: event.slug || slugger.slug(event.name || 'untitled'),
      title: event.name || 'Untitled Event',
      desc: event.detail || '',
      leader: event.latest_users?.[0]?.name || 'Happy Hacking Space',
      leaderUsername: event.latest_users?.[0]?.username || '',
      cal: event.calendar_links?.google || null,
      start: event.start_date?.date || new Date().toISOString(),
      end: event.end_date?.date || new Date().toISOString(),
      youtube: null,
      ama: event.name?.startsWith('AMA:') || false,
      amaForm: false,
      amaId: '',
      amaAvatar: event.latest_users?.[0]?.avatar || '',
      avatar: event.latest_users?.[0]?.avatar || 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/320/apple/81/shrug_1f937.png',
      approved: true,
      location: event.venue?.name || 'Online',
      isCanceled: event.is_canceled || false,
      photo: event.highlight_photo || null
    })
    
    const upcomingEvents = upcomingData.data?.map(mapEvent) || []
    const pastEvents = pastData.data?.map(mapEvent) || []
    
    const allEvents = [...upcomingEvents, ...pastEvents]
    const uniqueEvents = Array.from(
      new Map(allEvents.map(event => [event.id, event])).values()
    )
    
    return orderBy(uniqueEvents, 'start')
  } catch (error) {
    console.error('Failed to fetch events:', error.message || error)
    
    throw new Error(`Unable to load events: ${error.message || 'Unknown error occurred'}`)
  }
}
