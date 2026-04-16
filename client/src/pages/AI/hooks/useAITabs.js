import { useEffect, useState } from 'react'
import { canUseCapability } from '../../../config/access'
import { TABS } from '../constants'

export function useAITabs(user) {
  const [tab, setTab] = useState('chat')

  const visibleTabs = TABS.filter(t => !t.capability || canUseCapability(t.capability, user))
  const activeTab = visibleTabs.find(t => t.id === tab) || visibleTabs[0] || null

  useEffect(() => {
    if (!activeTab && visibleTabs[0]) {
      setTab(visibleTabs[0].id)
    } else if (activeTab && activeTab.id !== tab) {
      setTab(activeTab.id)
    }
  }, [activeTab, tab, visibleTabs])

  return {
    tab,
    setTab,
    visibleTabs,
    activeTab,
  }
}
