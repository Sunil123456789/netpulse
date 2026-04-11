import { Client } from '@elastic/elasticsearch'
import { readFileSync } from 'fs'

let client

export function getESClient() {
  if (!client) {
    const config = {
      node: process.env.ES_HOST,
      auth: {
        username: process.env.ES_USER,
        password: process.env.ES_PASSWORD,
      },
    }
    if (process.env.ES_CA_CERT_PATH) {
      try {
        config.tls = { ca: readFileSync(process.env.ES_CA_CERT_PATH) }
      } catch {
        config.tls = { rejectUnauthorized: false }
      }
    }
    client = new Client(config)
    console.log('Elasticsearch client initialized')
  }
  return client
}
