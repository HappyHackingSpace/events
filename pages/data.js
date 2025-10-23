import Head from 'next/head'
import Meta from '@happyhackingspace/meta'
import { Container, BaseStyles } from 'theme-ui'
import Content from '../components/api.mdx'

export default () => (
  <>
    <Meta
      as={Head}
      title="Data API"
      name="Happy Hacking Space Events"
      description="API for Happy Hacking Space Events."
      image="https://events.happyhacking.space/card.png"
    />
    <Container as={BaseStyles} variant="copy" sx={{ py: 3, fontSize: 2 }}>
      <Content />
    </Container>
  </>
)
