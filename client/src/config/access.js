import { isFeatureEnabled } from './features'

export const APP_ROUTE_ACCESS = [
  { path: '/home', title: 'Command Center', navLabel: 'Home', icon: '🏠', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/soc', title: 'Security Operations Center', navLabel: 'SOC', icon: '⚡', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/noc', title: 'Network Operations Center', navLabel: 'NOC', icon: '🌐', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/edr', title: 'Endpoint Detection & Response', navLabel: 'EDR', icon: '🛡️', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/zabbix', title: 'Infrastructure Monitoring', navLabel: 'Infrastructure', icon: '🖥️', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/tickets', title: 'Ticket Management', navLabel: 'Tickets', icon: '🎫', roles: ['admin', 'analyst'], feature: 'tickets' },
  { path: '/ai', title: 'AI Intelligence Center', navLabel: 'AI', icon: '🤖', roles: ['admin', 'analyst', 'viewer'] },
  { path: '/reports', title: 'Reports & Analytics', navLabel: 'Reports', icon: '📊', roles: ['admin', 'analyst'], feature: 'reports' },
  { path: '/admin', title: 'Administration', navLabel: 'Admin', icon: '⚙️', roles: ['admin'] },
]

export const APP_CAPABILITIES = {
  viewTickets:   { roles: ['admin', 'analyst'], feature: 'tickets' },
  createTickets: { roles: ['admin', 'analyst'], feature: 'tickets' },
  viewReports:   { roles: ['admin', 'analyst'], feature: 'reports' },
  manageAISettings: { roles: ['admin'] },
  manageAdmin:   { roles: ['admin'] },
}

function getRouteConfig(path) {
  return APP_ROUTE_ACCESS.find(route => route.path === path) || null
}

function getCapabilityConfig(capability) {
  return APP_CAPABILITIES[capability] || null
}

function isRoleAllowed(config, user) {
  return config.roles.includes(user?.role)
}

function isFeatureAllowed(config) {
  return !config.feature || isFeatureEnabled(config.feature)
}

export function canAccessPath(path, user) {
  const route = getRouteConfig(path)
  if (!route) return true
  return isRoleAllowed(route, user) && isFeatureAllowed(route)
}

export function canUseCapability(capability, user) {
  const config = getCapabilityConfig(capability)
  if (!config) return false
  return isRoleAllowed(config, user) && isFeatureAllowed(config)
}

export function getVisibleNavItems(user) {
  return APP_ROUTE_ACCESS.filter(route => route.navLabel && canAccessPath(route.path, user))
}

export function getPageTitle(path, user) {
  const route = getRouteConfig(path)
  if (!route) return 'NetPulse'
  return canAccessPath(path, user) ? route.title : 'NetPulse'
}
