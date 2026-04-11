db = db.getSiblingDB('netpulse')
db.createCollection('users')
db.createCollection('devices')
db.createCollection('sites')
db.createCollection('tickets')
db.createCollection('alertrules')
db.users.insertOne({
  name: 'Admin', email: 'admin@netpulse.local',
  password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/oL6/a7q2i',
  role: 'admin', active: true, createdAt: new Date(), updatedAt: new Date()
})
db.sites.insertMany([
  { name: 'Bhiwadi-WH', location: 'Bhiwadi, Rajasthan', active: true, createdAt: new Date(), updatedAt: new Date() },
  { name: 'Gurgaon-WH', location: 'Gurgaon, Haryana',  active: true, createdAt: new Date(), updatedAt: new Date() },
])
print('NetPulse DB initialized — admin@netpulse.local / Admin@123')
