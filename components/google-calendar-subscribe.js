import { Button, Box } from 'theme-ui'
import { Calendar } from 'react-feather'
import { useState } from 'react'

const GoogleCalendarSubscribe = () => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  
  const handleSubscribe = () => {
    setShowPopup(true)
  }

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <Button
          onClick={handleSubscribe}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bg: 'primary',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            px: 3,
            py: 2,
            fontSize: 2,
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              bg: 'secondary',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            },
            '&:active': {
              transform: 'translateY(0)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
            }
          }}
        >
          <Calendar size={18} />
          Subscribe to Calendar
        </Button>
        
        {showTooltip && (
          <Box
            sx={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              mb: 2,
              bg: 'background',
              color: 'text',
              px: 3,
              py: 2,
              borderRadius: '4px',
              fontSize: 1,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              border: '1px solid',
              borderColor: 'muted',
              zIndex: 1000,
              '&::after': {
                content: '""',
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid',
                borderTopColor: 'muted'
              }
            }}
          >
            Add Happy Hacking Space events to your calendar
          </Box>
        )}
      </Box>

      {/* Popup Modal */}
      {showPopup && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bg: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            p: 3
          }}
          onClick={() => setShowPopup(false)}
        >
          <Box
            sx={{
              bg: 'background',
              borderRadius: '8px',
              p: 4,
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            
            <Box sx={{ textAlign: 'center' }}>
              <Calendar size={48} sx={{ color: 'primary', mb: 3, mx: 'auto' }} />
              <Box as="h3" sx={{ fontSize: 3, fontWeight: 'bold', mb: 3, color: 'text' }}>
                Add to Google Calendar
              </Box>
              
              <Box sx={{ textAlign: 'left', mb: 4, color: 'text', lineHeight: 1.6 }}>
                <Box as="p" sx={{ mb: 2 }}>
                  To add Happy Hacking Space events to your calendar:
                </Box>
                <Box as="ol" sx={{ pl: 3, mb: 3 }}>
                  <Box as="li" sx={{ mb: 2 }}>
                    Open Google Calendar and click the "+" sign in the "Other calendars" section on the left menu
                  </Box>
                  <Box as="li" sx={{ mb: 2 }}>
                    Select the "From URL" option
                  </Box>
                  <Box as="li" sx={{ mb: 2 }}>
                    Paste the following URL:
                    <Box
                      sx={{
                        bg: 'muted',
                        p: 2,
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: 1,
                        mt: 1,
                        wordBreak: 'break-all'
                      }}
                    >
                      https://happyhacking.space/api/events.ics
                    </Box>
                  </Box>
                  <Box as="li">
                    Click the "Add calendar" button
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  onClick={() => setShowPopup(false)}
                  sx={{
                    bg: 'muted',
                    color: 'text',
                    px: 4,
                    py: 2,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: 'border',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Got it
                </Button>
                
                <Button
                  onClick={() => {
                    window.open('https://calendar.google.com/', '_blank')
                    setShowPopup(false)
                  }}
                  sx={{
                    bg: 'primary',
                    color: 'white',
                    px: 4,
                    py: 2,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Go to Google Calendar
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </>
  )
}

export default GoogleCalendarSubscribe
