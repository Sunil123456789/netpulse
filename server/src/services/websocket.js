import { getESClient } from '../config/elasticsearch.js'

export function initWebSocket(io) {
  io.on('connection', socket => {
    console.log('Client connected:', socket.id)
    socket.on('subscribe', ({ index }) => {
      socket.join(index)
      console.log(`${socket.id} subscribed to ${index}`)
    })
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id))
  })

  setInterval(async () => {
    try {
      const es = getESClient()
      const result = await es.search({
        index: 'firewall-*,cisco-*',
        body: {
          size: 10,
          sort: [{ '@timestamp': { order: 'desc' } }],
          query: { range: { '@timestamp': { gte: 'now-10s' } } },
          _source: [
            '@timestamp', '_index',
            'syslog_severity_label', 'cisco_severity_label',
            'fgt.action', 'fgt.srcip', 'fgt.dstip', 'fgt.srccountry', 'fgt.app', 'fgt.subtype', 'fgt.type', 'fgt.msg',
            'cisco_mnemonic', 'cisco_message', 'cisco_interface_full', 'cisco_vlan_id',
            'device_name', 'site_name',
          ],
        },
      })
      if (result.hits.hits.length > 0) {
        io.emit('live:events', result.hits.hits.map(h => ({ ...h._source, _index: h._index })))
      }
    } catch (err) { console.error('websocket live feed error:', err.message) }
  }, 5000)
}
