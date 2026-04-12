import React, { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import Search from './pages/Search/Search'
import Project from './pages/Project/Project'
import Global from './pages/Global/Global'
import Publish from './pages/Publish/Publish'
import Settings from './pages/Settings/Settings'
import { NotificationContainer } from './components/Notification/NotificationContainer'
import CommandLogWindow from './components/CommandLog/CommandLogWindow'
import { useAppStore } from './stores/appStore'

const App: React.FC = () => {
  const initCurrentPath = useAppStore((state) => state.initCurrentPath)
  
  useEffect(() => {
    initCurrentPath()
  }, [])
  
  return (
    <>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/project" element={<Project />} />
          <Route path="/global" element={<Global />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MainLayout>
      <NotificationContainer />
      <CommandLogWindow />
    </>
  )
}

export default App