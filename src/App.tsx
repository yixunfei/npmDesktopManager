import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import { NotificationContainer } from './components/Notification/NotificationContainer'
import CommandLogWindow from './components/CommandLog/CommandLogWindow'
import { useAppStore } from './stores/appStore'

const Search = lazy(() => import('./pages/Search/Search'))
const Project = lazy(() => import('./pages/Project/Project'))
const Global = lazy(() => import('./pages/Global/Global'))
const Publish = lazy(() => import('./pages/Publish/Publish'))
const Settings = lazy(() => import('./pages/Settings/Settings'))

const App: React.FC = () => {
  const initCurrentPath = useAppStore((state) => state.initCurrentPath)
  
  useEffect(() => {
    initCurrentPath()
  }, [])
  
  return (
    <>
      <MainLayout>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/project" element={<Project />} />
            <Route path="/global" element={<Global />} />
            <Route path="/publish" element={<Publish />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </MainLayout>
      <NotificationContainer />
      <CommandLogWindow />
    </>
  )
}

export default App
