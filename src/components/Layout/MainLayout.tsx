import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Segmented, Tooltip } from 'antd'
import {
  SearchOutlined,
  FolderOutlined,
  GlobalOutlined,
  CodeOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  DesktopOutlined,
  BulbOutlined,
  BulbFilled,
  ApartmentOutlined
} from '@ant-design/icons'
import { ThemeMode, useThemeStore } from '../../stores/themeStore'
import { useResolvedTheme } from '../../hooks/useResolvedTheme'
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
  
  const isDark = resolvedMode === 'dark'
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode)
  }, [resolvedMode])
  
  const menuItems = [
    {
      key: '/',
      icon: <SearchOutlined />,
      label: '搜索'
    },
    {
      key: '/project',
      icon: <FolderOutlined />,
      label: '项目依赖'
    },
    {
      key: '/global',
      icon: <GlobalOutlined />,
      label: '全局依赖'
    },
    {
      key: '/pip',
      icon: <CodeOutlined />,
      label: 'pip 管理'
    },
    {
      key: '/maven',
      icon: <ApartmentOutlined />,
      label: 'Maven 管理'
    },
    {
      key: '/publish',
      icon: <CloudUploadOutlined />,
      label: '发布管理'
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置'
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
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className={styles.menu}
          theme={isDark ? 'dark' : 'light'}
        />
        <div className={styles.themeSwitch}>
          <Tooltip title="主题跟随系统、亮色或暗色">
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
          npmDesktopManager v1.0.0 | Made with ❤️
        </Footer>
      </Layout>
    </Layout>
  )
}

export default MainLayout
