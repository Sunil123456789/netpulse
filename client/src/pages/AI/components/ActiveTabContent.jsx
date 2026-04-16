import { TabPlaceholder } from './Common.jsx'
import AnomalyTab from '../tabs/AnomalyTab.jsx'
import BriefTab from '../tabs/BriefTab.jsx'
import ChatTab from '../tabs/ChatTab.jsx'
import ModelLabTab from '../tabs/ModelLabTab.jsx'
import SearchTab from '../tabs/SearchTab.jsx'
import SettingsTab from '../tabs/SettingsTab.jsx'
import TriageTab from '../tabs/TriageTab.jsx'

export default function ActiveTabContent({
  tab,
  activeTab,
  range,
  setRange,
  configs,
  setConfigs,
  providerStatus,
  ollamaStatus,
  schedulerStatus,
  setSchedulerStatus,
  addToast,
  onRefresh,
}) {
  if (!activeTab) return null

  if (tab === 'settings') {
    return (
      <SettingsTab
        configs={configs}
        setConfigs={setConfigs}
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        schedulerStatus={schedulerStatus}
        setSchedulerStatus={setSchedulerStatus}
        addToast={addToast}
        onRefresh={onRefresh}
      />
    )
  }

  if (tab === 'chat') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ChatTab
          providerStatus={providerStatus}
          ollamaStatus={ollamaStatus}
          range={range}
          addToast={addToast}
        />
      </div>
    )
  }

  if (tab === 'anomaly') {
    return (
      <AnomalyTab
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        range={range}
        addToast={addToast}
      />
    )
  }

  if (tab === 'triage') {
    return (
      <TriageTab
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        addToast={addToast}
      />
    )
  }

  if (tab === 'brief') {
    return (
      <BriefTab
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        range={range}
        setRange={setRange}
        addToast={addToast}
      />
    )
  }

  if (tab === 'search') {
    return (
      <SearchTab
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        range={range}
        addToast={addToast}
      />
    )
  }

  if (tab === 'modellab') {
    return (
      <ModelLabTab
        providerStatus={providerStatus}
        ollamaStatus={ollamaStatus}
        range={range}
        addToast={addToast}
      />
    )
  }

  return <TabPlaceholder tab={activeTab} />
}
