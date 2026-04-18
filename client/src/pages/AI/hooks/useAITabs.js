import { useEffect, useState } from 'react'
import { canUseCapability } from '../../../config/access'
import { SECTION_STORAGE_KEY, TAB_SECTIONS, TAB_STORAGE_KEY } from '../constants'

function readSavedSection() {
  if (typeof window === 'undefined') return 'ai'
  return window.localStorage.getItem(SECTION_STORAGE_KEY) || 'ai'
}

function readSavedTabs() {
  if (typeof window === 'undefined') {
    return { ai: 'chat', ml: 'anomaly', settings: 'settings' }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(TAB_STORAGE_KEY) || '{}')
    return {
      ai: parsed.ai || 'chat',
      ml: parsed.ml || 'anomaly',
      settings: parsed.settings || 'settings',
    }
  } catch {
    return { ai: 'chat', ml: 'anomaly', settings: 'settings' }
  }
}

export function useAITabs(user) {
  const [section, setSectionState] = useState(() => readSavedSection())
  const [tabsBySection, setTabsBySection] = useState(() => readSavedTabs())

  const visibleSections = TAB_SECTIONS
    .map(sectionDef => ({
      ...sectionDef,
      tabs: sectionDef.tabs.filter(tab => !tab.capability || canUseCapability(tab.capability, user)),
    }))
    .filter(sectionDef => sectionDef.tabs.length > 0)

  const activeSection = visibleSections.find(sectionDef => sectionDef.id === section) || visibleSections[0] || null
  const visibleTabs = activeSection?.tabs || []
  const activeTabId = activeSection ? tabsBySection[activeSection.id] : null
  const activeTab = visibleTabs.find(tab => tab.id === activeTabId) || visibleTabs[0] || null

  useEffect(() => {
    if (!activeSection) return
    if (activeSection.id !== section) {
      setSectionState(activeSection.id)
      return
    }

    if (activeTab && activeTab.id !== activeTabId) {
      setTabsBySection(prev => ({ ...prev, [activeSection.id]: activeTab.id }))
    }
  }, [activeSection, activeTab, activeTabId, section])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SECTION_STORAGE_KEY, section)
  }, [section])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabsBySection))
  }, [tabsBySection])

  function setSection(nextSection) {
    setSectionState(nextSection)
  }

  function setTab(nextTab) {
    if (!activeSection) return
    setTabsBySection(prev => ({ ...prev, [activeSection.id]: nextTab }))
  }

  function setTabDirect(sectionId, tabId) {
    setSectionState(sectionId)
    setTabsBySection(prev => ({ ...prev, [sectionId]: tabId }))
  }

  return {
    section,
    setSection,
    tab: activeTab?.id || null,
    setTab,
    setTabDirect,
    visibleSections,
    visibleTabs,
    activeSection,
    activeTab,
  }
}
