import { Box, Text, Heading, Flex } from 'theme-ui'
import { Repeat } from 'react-feather'
import tt from 'tinytime'
import Link from 'next/link'
import Sparkles from './sparkles'

const CadenceBadge = ({ cadence, sx }) => (
  <Flex
    sx={{
      alignItems: 'center',
      gap: 1,
      bg: 'rgba(0,0,0,0.62)',
      color: 'white',
      px: 2,
      py: '4px',
      borderRadius: 'circle',
      fontSize: 0,
      fontWeight: 'bold',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      backdropFilter: 'blur(4px)',
      ...sx
    }}
  >
    <Repeat size={12} strokeWidth={2.5} />
    {cadence}
  </Flex>
)

const past = dt => new Date(dt) < new Date()
const now = (start, end) =>
  new Date() > new Date(start) && new Date() < new Date(end)

// Safe date formatter
const formatDate = (dateStr, format) => {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'Invalid Date'
    return tt(format).render(date)
  } catch (error) {
    return 'Invalid Date'
  }
}

const Event = ({ slug, title, photo, start, end, location, cadence }) => (
  <Link href="/[slug]" as={`/${slug}`} passHref legacyBehavior>
    <Box
      as="a"
      sx={{
        position: 'relative',
        textDecoration: 'none',
        bg: 'elevated',
        color: 'text',
        p: [3, 3]
      }}
    >
      {/* Date section — unchanged */}
      <Box
        sx={{
          bg: past(end) ? 'sunken' : 'primary',
          color: past(end) ? 'text' : 'white',
          lineHeight: ['subheading', 'body'],
          m: -3,
          py: 2,
          px: 3,
          mb: photo ? 0 : 3,
          strong: { display: ['block', 'inline'] }
        }}
      >
        <Text>
          <strong>{formatDate(start, '{MM} {Do}')}</strong>{' '}
          {formatDate(start, '{h}:{mm}')}–{formatDate(end, '{h}:{mm} {a}')}
        </Text>
      </Box>

      {/* Event graphic */}
      {photo && (
        <Box sx={{ mx: -3, mb: 3, position: 'relative' }}>
          <Box
            as="img"
            src={photo}
            alt={title}
            loading="lazy"
            sx={{
              width: '100%',
              aspectRatio: '16 / 9',
              objectFit: 'cover',
              display: 'block',
              filter: past(end) ? 'saturate(0.7) brightness(0.85)' : 'none'
            }}
          />
          {cadence && (
            <CadenceBadge
              cadence={cadence}
              sx={{ position: 'absolute', top: 2, right: 2, boxShadow: 'card' }}
            />
          )}
        </Box>
      )}

      <Heading variant="subheadline" sx={{ mt: 0, mb: location ? 1 : 0 }}>
        {title}
      </Heading>
      {!photo && cadence && (
        <CadenceBadge
          cadence={cadence}
          sx={{ display: 'inline-flex', bg: 'muted', mb: 1 }}
        />
      )}
      {location && (
        <Text sx={{ color: 'muted', fontSize: 1, display: 'block' }}>
          📍 {location}
        </Text>
      )}

      {now(start, end) && (
        <Sparkles
          aria-hidden
          style={{
            pointerEvents: 'none',
            position: 'absolute !important',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }}
        />
      )}
    </Box>
  </Link>
)

export default Event
