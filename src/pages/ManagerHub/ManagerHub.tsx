import React from 'react'
import { Button, Card, Space, Typography } from 'antd'
import { AppstoreOutlined, ApartmentOutlined, BranchesOutlined, CloudUploadOutlined, CodeOutlined, DeploymentUnitOutlined, FolderOpenOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/appStore'
import styles from './ManagerHub.module.css'

const { Paragraph, Title, Text } = Typography

const ManagerHub: React.FC = () => {
  const navigate = useNavigate()
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({
      type: 'info',
      message: '工作目录已切换',
      description: path
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={2} className={styles.title}>管理中心</Title>
        <Paragraph className={styles.subtitle}>
          先选管理类型，再进入项目、全局、发布与版本配置。
        </Paragraph>
        <Space wrap>
          <span className={styles.pathLabel}>当前目录</span>
          <Text className={styles.pathValue}>{currentPath || '未选择'}</Text>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>选择目录</Button>
        </Space>
      </div>

      <div className={styles.grid}>
        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <AppstoreOutlined className={styles.icon} />
            <Title level={4}>npm 管理</Title>
            <Paragraph className={styles.cardText}>
              项目依赖、全局包、发布管理、版本切换与工具链绑定。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/npm')}>进入 npm 管理</Button>
          </Space>
        </Card>

        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <ApartmentOutlined className={styles.icon} />
            <Title level={4}>Maven 管理</Title>
            <Paragraph className={styles.cardText}>
              项目依赖、仓库配置、deploy 发布、版本约束与工具版本绑定。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/maven')}>进入 Maven 管理</Button>
          </Space>
        </Card>

        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <BranchesOutlined className={styles.icon} />
            <Title level={4}>Cargo 管理</Title>
            <Paragraph className={styles.cardText}>
              Rust crates、Cargo.toml 依赖、命令运行、依赖树与安全审计。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/cargo')}>进入 Cargo 管理</Button>
          </Space>
        </Card>

        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <ApartmentOutlined className={styles.icon} />
            <Title level={4}>Gradle 管理</Title>
            <Paragraph className={styles.cardText}>
              JVM 依赖、Maven Central 搜索、任务运行、依赖树与 insight。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/gradle')}>进入 Gradle 管理</Button>
          </Space>
        </Card>

        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <CodeOutlined className={styles.icon} />
            <Title level={4}>Go 管理</Title>
            <Paragraph className={styles.cardText}>
              go.mod 模块、GitHub 搜索、版本更新、tidy、graph 与漏洞检查。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/go')}>进入 Go 管理</Button>
          </Space>
        </Card>

        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <SettingOutlined className={styles.icon} />
            <Title level={4}>pip 管理</Title>
            <Paragraph className={styles.cardText}>
              环境包、配置源、审计修复、发布与 Python 版本绑定。
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/pip')}>进入 pip 管理</Button>
          </Space>
        </Card>
        <Card className={styles.card} variant="borderless">
          <Space orientation="vertical" size={12}>
            <DeploymentUnitOutlined className={styles.icon} />
            <Title level={4}>Plugin Components</Title>
            <Paragraph className={styles.cardText}>
              Cargo, Gradle, Go and componentized manager extensions.
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/plugins')}>Open Plugin Components</Button>
          </Space>
        </Card>
      </div>

      <div className={styles.footerLinks}>
        <Button icon={<SearchOutlined />} onClick={() => navigate('/search')}>搜索</Button>
        <Button icon={<CloudUploadOutlined />} onClick={() => navigate('/publish')}>发布管理</Button>
      </div>
    </div>
  )
}

export default ManagerHub
