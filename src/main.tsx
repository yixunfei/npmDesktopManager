import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp, theme } from 'antd'
import App from './App'
import './styles/global.css'
import { useThemeStore } from './stores/themeStore'
import { useResolvedTheme } from './hooks/useResolvedTheme'

const Root: React.FC = () => {
  const mode = useThemeStore((state) => state.mode)
  const resolvedMode = useResolvedTheme(mode)
  
  return (
    <React.StrictMode>
      <HashRouter>
        <ConfigProvider
          theme={{
            algorithm: resolvedMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
              colorPrimary: '#1890ff',
              borderRadius: 6,
            }
          }}
        >
          <AntdApp>
            <App />
          </AntdApp>
        </ConfigProvider>
      </HashRouter>
    </React.StrictMode>
  )
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(<Root />)
