import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import { NotificationContainer } from './components/Notification/NotificationContainer'
import CommandLogWindow from './components/CommandLog/CommandLogWindow'
import ToolchainStatusModal from './components/Toolchain/ToolchainStatusModal'
import { LanguageStartupGate } from './components/Localization/LanguageStartupGate'
import { RuntimeLocalizer } from './components/Localization/RuntimeLocalizer'
import { useAppStore } from './stores/appStore'

const Search = lazy(() => import('./pages/Search/Search'))
const ManagerHub = lazy(() => import('./pages/ManagerHub/ManagerHub'))
const Project = lazy(() => import('./pages/Project/Project'))
const Global = lazy(() => import('./pages/Global/Global'))
const MultiManager = lazy(() => import('./pages/MultiManager/MultiManager'))
const Cargo = lazy(() => import('./pages/Cargo/Cargo'))
const Gradle = lazy(() => import('./pages/Gradle/Gradle'))
const Go = lazy(() => import('./pages/Go/Go'))
const Native = lazy(() => import('./pages/Native/Native'))
const Publish = lazy(() => import('./pages/Publish/Publish'))
const Settings = lazy(() => import('./pages/Settings/Settings'))
const ToolVersions = lazy(() => import('./pages/ToolVersions/ToolVersions'))
const PluginComponents = lazy(() => import('./pages/PluginComponents/PluginComponents'))

const App: React.FC = () => {
  const initCurrentPath = useAppStore((state) => state.initCurrentPath)
  
  useEffect(() => {
    initCurrentPath()
  }, [])
  
  return (
    <>
      <RuntimeLocalizer />
      <LanguageStartupGate />
      <MainLayout>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<MultiManager initialManager="npm" />} />
            <Route path="/hub" element={<ManagerHub />} />
            <Route path="/search" element={<Search />} />
            <Route path="/project" element={<Project />} />
            <Route path="/global" element={<Global />} />
            <Route path="/multi-manager" element={<MultiManager />} />
            <Route path="/npm" element={<MultiManager initialManager="npm" />} />
            <Route path="/pip" element={<MultiManager initialManager="pip" />} />
            <Route path="/maven" element={<MultiManager initialManager="maven" />} />
            <Route path="/cargo" element={<Cargo />} />
            <Route path="/gradle" element={<Gradle />} />
            <Route path="/go" element={<Go />} />
            <Route path="/native" element={<Native />} />
            <Route path="/publish" element={<Publish />} />
            <Route path="/tool-versions" element={<ToolVersions />} />
            <Route path="/plugins" element={<PluginComponents />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </MainLayout>
      <NotificationContainer />
      <CommandLogWindow />
      <ToolchainStatusModal />
    </>
  )
}

export default App
