import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Segmented, Tooltip } from 'antd'
import {
  SearchOutlined,
  GlobalOutlined,
  CodeOutlined,
  ApartmentOutlined,
  SettingOutlined,
  DesktopOutlined,
  BulbOutlined,
  BulbFilled,
  AppstoreOutlined,
  ToolOutlined
} from '@ant-design/icons'
import { ThemeMode, useThemeStore } from '../../stores/themeStore'
import { useResolvedTheme } from '../../hooks/useResolvedTheme'
import { useT } from '../../i18n'
import styles from './MainLayout.module.css'

const { Sider, Content, Footer } = Layout

interface MainLayoutProps {
  children: React.ReactNode
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, setMode } = useThemeStore()
  const resolvedMode = useResolvedTheme(mode)
  const t = useT()
  
  const isDark = resolvedMode === 'dark'
  const activeMenuKey = (() => {
    if (location.pathname === '/' || location.pathname === '/hub' || location.pathname === '/multi-manager') return '/npm'
    if (location.pathname === '/project' || location.pathname === '/publish') return '/npm'
    return location.pathname
  })()
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode)
  }, [resolvedMode])
  
  const menuItems = [
    {
      key: '/npm',
      icon: <AppstoreOutlined />,
      label: t('layout.npmManagement')
    },
    {
      key: '/pip',
      icon: <CodeOutlined />,
      label: t('layout.pipManagement')
    },
    {
      key: '/maven',
      icon: <ApartmentOutlined />,
      label: t('layout.mavenManagement')
    },
    {
      key: '/global',
      icon: <GlobalOutlined />,
      label: t('layout.globalManagement')
    },
    {
      key: '/tool-versions',
      icon: <ToolOutlined />,
      label: t('layout.toolVersions')
    },
    {
      key: '/search',
      icon: <SearchOutlined />,
      label: t('layout.search')
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: t('layout.settings')
    }
  ]
  
  return (
    <Layout 
      className={styles.layout} 
      style={{ 
        background: isDark ? 'var(--bg-primary)' : 'var(--bg-primary)'
      }}
    >
      <Sider 
        width={200} 
        className={styles.sider}
        theme={isDark ? 'dark' : 'light'}
        style={{ 
          background: isDark ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          borderColor: 'var(--border-color)'
        }}
      >
        <div className={styles.logo}>
          <img 
            src="../../../icon.jpg" 
            alt="Logo" 
            className={styles.logoIcon}
            style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 4,
              objectFit: 'cover'
            }}
          />
          <div className={styles.logoText} style={{ color: isDark ? '#ccc' : '#333' }}>
            npmDesktopManager
          </div>
        </div>
          <Menu
          mode="inline"
          selectedKeys={[activeMenuKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className={styles.menu}
          theme={isDark ? 'dark' : 'light'}
        />
        <div className={styles.themeSwitch}>
          <Tooltip title={t('layout.themeTooltip')}>
            <Segmented<ThemeMode>
              size="small"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'system', icon: <DesktopOutlined /> },
                { value: 'light', icon: <BulbOutlined /> },
                { value: 'dark', icon: <BulbFilled /> }
              ]}
            />
          </Tooltip>
        </div>
      </Sider>
      <Layout 
        className={styles.contentLayout} 
        style={{ background: 'var(--bg-primary)' }}
      >
        <Content 
          className={styles.content} 
          style={{ background: 'var(--bg-primary)' }}
        >
          {children}
        </Content>
        <Footer 
          className={styles.footer} 
          style={{ 
            background: 'var(--bg-primary)', 
            color: 'var(--text-secondary)',
            borderColor: 'var(--border-color)'
          }}
        >
          npmDesktopManager v1.0.0
        </Footer>
      </Layout>
    </Layout>
  )
}

export default MainLayout
