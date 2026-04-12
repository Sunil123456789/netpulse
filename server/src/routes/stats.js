import { Router } from 'express'
import { getESClient } from '../config/elasticsearch.js'

const router = Router()

router.get('/soc', async (req, res) => {
  try {
    const es = getESClient()
    const range = req.query.range || '24h'
    const from = req.query.from
    const to = req.query.to
    const timeRange = from && to ? { gte: from, lte: to } : { gte: 'now-' + range }

    const [totalHits, deniedHits, ipsHits, authHits, utmHits, vpnHits] = await Promise.all([
      es.count({ index: 'firewall-*', body: { query: { range: { '@timestamp': timeRange } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'fgt.action.keyword': 'deny' } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'fgt.subtype.keyword': 'ips' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { terms: { 'cisco_mnemonic.keyword': ['LOGIN_SUCCESS','LOGOUT','SSH2_USERAUTH','SSH2_SESSION'] } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'fgt.type.keyword': 'utm' } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'fgt.type.keyword': 'vpn' } }] } } } }),
    ])

    res.json({
      total:    totalHits.count,
      denied:   deniedHits.count,
      ips:      ipsHits.count,
      auth:     authHits.count,
      utm:      utmHits.count,
      vpn:      vpnHits.count,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/noc', async (req, res) => {
  try {
    const es = getESClient()
    const range = req.query.range || '24h'
    const from = req.query.from
    const to = req.query.to
    const timeRange = from && to ? { gte: from, lte: to } : { gte: 'now-' + range }

    const [total, updown, macflap, vlanmismatch, sites] = await Promise.all([
      es.count({ index: 'cisco-*', body: { query: { range: { '@timestamp': timeRange } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'cisco_mnemonic.keyword': 'UPDOWN' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'cisco_mnemonic.keyword': 'MACFLAP_NOTIF' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': timeRange } }, { term: { 'cisco_mnemonic.keyword': 'NATIVE_VLAN_MISMATCH' } }] } } } }),
      es.search({ index: 'cisco-*,firewall-*', body: { size: 0, query: { range: { '@timestamp': timeRange } }, aggs: { sites: { terms: { field: 'site_name.keyword', size: 10 } } } } }),
    ])

    res.json({
      total:        total.count,
      updown:       updown.count,
      macflap:      macflap.count,
      vlanmismatch: vlanmismatch.count,
      sites:        sites.aggregations.sites.buckets,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router

