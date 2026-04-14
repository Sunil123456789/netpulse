import { getESClient } from '../../config/elasticsearch.js'

// PORT SCAN DETECTION
// Detects IPs connecting to many different ports in short time
async function detectPortScans({
  dateRange = null,
  portThreshold = 15,
  timeWindowMinutes = 10
}) {
  void timeWindowMinutes
  const es = getESClient()
  const to = dateRange?.to || 'now'
  const from = dateRange?.from || 'now-1h'

  try {
    const result = await es.search({
      index: 'firewall-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': { gte: from, lte: to } } },
        aggs: {
          by_src_ip: {
            terms: {
              field: 'fgt.srcip.keyword',
              size: 100,
              min_doc_count: portThreshold
            },
            aggs: {
              unique_dst_ports: {
                cardinality: { field: 'fgt.dstport' }
              },
              unique_dst_ips: {
                cardinality: { field: 'fgt.dstip.keyword' }
              },
              src_country: {
                terms: { field: 'fgt.srccountry.keyword', size: 1 }
              }
            }
          }
        }
      }
    })

    const scanners = result.aggregations?.by_src_ip?.buckets
      ?.filter(b => b.unique_dst_ports?.value >= portThreshold)
      ?.map(b => ({
        srcip: b.key,
        totalConnections: b.doc_count,
        uniquePorts: b.unique_dst_ports?.value || 0,
        uniqueTargets: b.unique_dst_ips?.value || 0,
        country: b.src_country?.buckets?.[0]?.key || 'Unknown',
        severity: b.unique_dst_ports?.value >= 50 ? 'critical'
          : b.unique_dst_ports?.value >= 30 ? 'high'
          : b.unique_dst_ports?.value >= 15 ? 'medium' : 'low',
        type: 'port_scan',
        description: `IP ${b.key} scanned ${b.unique_dst_ports?.value} unique ports across ${b.unique_dst_ips?.value} targets`,
        recommendation: `Block source IP ${b.key} at perimeter firewall. Add to threat blocklist.`
      })) || []

    return {
      type: 'port_scan',
      detectedAt: new Date().toISOString(),
      dateRange: { from, to },
      portThreshold,
      totalScannersFound: scanners.length,
      scanners: scanners.sort((a, b) => b.uniquePorts - a.uniquePorts)
    }
  } catch (err) {
    throw new Error(`Port scan detection failed: ${err.message}`)
  }
}

// BRUTE FORCE DETECTION
// Detects IPs with high volume of failed auth attempts
async function detectBruteForce({
  dateRange = null,
  failureThreshold = 50
}) {
  const es = getESClient()
  const to = dateRange?.to || 'now'
  const from = dateRange?.from || 'now-1h'

  try {
    // Check Cisco switch failed logins
    const ciscoResult = await es.search({
      index: 'cisco-*',
      body: {
        size: 0,
        query: { bool: { must: [
          { range: { '@timestamp': { gte: from, lte: to } } },
          { terms: { 'cisco_mnemonic.keyword': [
            'LOGIN_FAILED', 'AUTHFAIL', 'SSH2_USERAUTH_FAIL'
          ]}}
        ]}},
        aggs: {
          by_device: {
            terms: { field: 'device_name.keyword', size: 20 },
            aggs: {
              attempt_count: { value_count: { field: '@timestamp' } }
            }
          }
        }
      }
    })

    // Check FortiGate VPN/auth failures
    const fgtResult = await es.search({
      index: 'firewall-*',
      body: {
        size: 0,
        query: { bool: { must: [
          { range: { '@timestamp': { gte: from, lte: to } } },
          { term: { 'fgt.subtype.keyword': 'vpn' } },
          { term: { 'fgt.action.keyword': 'deny' } }
        ]}},
        aggs: {
          by_src: {
            terms: {
              field: 'fgt.srcip.keyword',
              size: 20,
              min_doc_count: failureThreshold
            },
            aggs: {
              country: { terms: { field: 'fgt.srccountry.keyword', size: 1 } }
            }
          }
        }
      }
    })

    const attacks = []

    // Process Cisco brute force
    const ciscoDevices = ciscoResult.aggregations?.by_device?.buckets || []
    for (const d of ciscoDevices) {
      if (d.doc_count >= failureThreshold) {
        attacks.push({
          type: 'brute_force',
          target: d.key,
          targetType: 'cisco_switch',
          attempts: d.doc_count,
          severity: d.doc_count >= 500 ? 'critical'
            : d.doc_count >= 200 ? 'high'
            : d.doc_count >= 50 ? 'medium' : 'low',
          description: `${d.doc_count} failed login attempts on switch ${d.key}`,
          recommendation: `Lock out accounts with failed attempts on ${d.key}. Check for SSH brute force.`
        })
      }
    }

    // Process FortiGate VPN brute force
    const fgtSources = fgtResult.aggregations?.by_src?.buckets || []
    for (const s of fgtSources) {
      attacks.push({
        type: 'brute_force',
        srcip: s.key,
        targetType: 'vpn_gateway',
        attempts: s.doc_count,
        country: s.country?.buckets?.[0]?.key || 'Unknown',
        severity: s.doc_count >= 500 ? 'critical'
          : s.doc_count >= 200 ? 'high'
          : 'medium',
        description: `${s.doc_count} VPN auth failures from ${s.key}`,
        recommendation: `Block IP ${s.key} at firewall. Consider geo-blocking if from unusual country.`
      })
    }

    return {
      type: 'brute_force',
      detectedAt: new Date().toISOString(),
      dateRange: { from, to },
      failureThreshold,
      totalAttacksFound: attacks.length,
      attacks: attacks.sort((a, b) => b.attempts - a.attempts)
    }
  } catch (err) {
    throw new Error(`Brute force detection failed: ${err.message}`)
  }
}

// GEO ANOMALY DETECTION
// Detects traffic from unusual/unexpected countries
async function detectGeoAnomalies({
  dateRange = null,
  expectedCountries = ['India', 'Reserved']
}) {
  const es = getESClient()
  const to = dateRange?.to || 'now'
  const from = dateRange?.from || 'now-24h'

  try {
    const result = await es.search({
      index: 'firewall-*',
      body: {
        size: 0,
        query: { bool: { must: [
          { range: { '@timestamp': { gte: from, lte: to } } },
          { term: { 'fgt.action.keyword': 'deny' } }
        ]}},
        aggs: {
          by_country: {
            terms: {
              field: 'fgt.srccountry.keyword',
              size: 30
            }
          }
        }
      }
    })

    const countries = result.aggregations?.by_country?.buckets || []
    const suspicious = countries
      .filter(c => !expectedCountries.includes(c.key) && c.key !== 'Unknown')
      .map(c => ({
        country: c.key,
        deniedCount: c.doc_count,
        severity: c.doc_count >= 100000 ? 'high'
          : c.doc_count >= 10000 ? 'medium' : 'low',
        description: `${c.doc_count.toLocaleString()} denied connections from ${c.key}`,
        recommendation: c.doc_count >= 100000
          ? `Consider geo-blocking ${c.key} at firewall`
          : `Monitor traffic from ${c.key}`
      }))

    return {
      type: 'geo_anomaly',
      detectedAt: new Date().toISOString(),
      dateRange: { from, to },
      totalCountries: countries.length,
      suspiciousCountries: suspicious.length,
      countries: suspicious.sort((a, b) => b.deniedCount - a.deniedCount)
    }
  } catch (err) {
    throw new Error(`Geo anomaly detection failed: ${err.message}`)
  }
}

export { detectPortScans, detectBruteForce, detectGeoAnomalies }
