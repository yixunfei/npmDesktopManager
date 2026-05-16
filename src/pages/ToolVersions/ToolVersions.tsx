import React from 'react'
import { Button, Space, Tabs, Typography } from 'antd'
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import ProjectToolchainPanel from '../../components/Toolchain/ProjectToolchainPanel'
import GlobalToolchainPanel from '../../components/Toolchain/GlobalToolchainPanel'
import styles from './ToolVersions.module.css'

const { Text } = Typography

const ToolVersionsPage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({
      type: 'info',
      message: '项目路径已切换',
      description: path
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>项目工具版本</h2>
          <Text type="secondary">
            为不同项目绑定 npm、pip/Python、Maven、Cargo、Gradle、Go 工具版本；项目配置优先于全局默认，留空时使用系统 PATH。
          </Text>
        </div>
        <Space wrap>
          <span className={styles.pathInfo}>
            <span className={styles.pathLabel}>当前项目:</span>
            <span className={styles.pathValue}>{currentPath || '未选择'}</span>
          </span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>
            选择目录
          </Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'project',
            label: '项目工具版本',
            children: <ProjectToolchainPanel projectPath={currentPath} />
          },
          {
            key: 'global',
            label: '全局默认版本',
            children: (
              <div className={styles.panel}>
                <GlobalToolchainPanel />
              </div>
            )
          }
        ]}
        tabBarExtraContent={{
          right: (
            <Button icon={<ReloadOutlined />} onClick={chooseDirectory}>
              切换项目
            </Button>
          )
        }}
      />
    </div>
  )
}

export default ToolVersionsPage
