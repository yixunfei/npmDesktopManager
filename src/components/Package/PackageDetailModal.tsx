import React, { useState, useEffect } from 'react'
import { Modal, Tabs, Descriptions, Tag, Spin, Tree, Alert, Button, Space, Collapse, Typography, Statistic, Row, Col, Card } from 'antd'
import {
  InfoCircleOutlined, CloudDownloadOutlined,
  FileTextOutlined, ApartmentOutlined, DownloadOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'

const { Panel } = Collapse
const { Text } = Typography

interface PackageDetailModalProps {
  visible: boolean
  packageName: string
  onClose: () => void
  onInstall?: (version?: string) => void
}

interface PackageInfo {
  name: string
  version: string
  description?: string
  author?: any
  license?: string
  homepage?: string
  repository?: any
  keywords?: string[]
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  time?: Record<string, string>
  maintainers?: any[]
}

export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  visible,
  packageName,
  onClose,
  onInstall
}) => {
  const [loading, setLoading] = useState(false)
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [sizeInfo, setSizeInfo] = useState<any>(null)
  const [dependencyTree, setDependencyTree] = useState<any>(null)
  const [readme, setReadme] = useState<string>('')
  const [dependents, setDependents] = useState<number>(0)
  const [downloads, setDownloads] = useState<any>(null)
  const [versions, setVersions] = useState<string[]>([])
  
  useEffect(() => {
    if (visible && packageName) {
      loadPackageInfo()
    }
  }, [visible, packageName])
  
  const loadPackageInfo = async () => {
    setLoading(true)
    try {
      const [info, size, tree, readmeContent, dependentsCount, downloadStats, versionList] = await Promise.all([
        window.electronAPI.npm.getPackageInfo(packageName),
        window.electronAPI.npm.getPackageSize(packageName),
        window.electronAPI.npm.getDependencyTree(packageName, undefined, 2),
        window.electronAPI.npm.getReadme(packageName),
        window.electronAPI.npm.getDependents(packageName),
        window.electronAPI.npm.downloadStats(packageName),
        window.electronAPI.npm.getVersions(packageName)
      ])
      
      setPackageInfo(info)
      setSizeInfo(size)
      setDependencyTree(tree)
      setReadme(readmeContent)
      setDependents(dependentsCount)
      setDownloads(downloadStats)
      setVersions(versionList)
    } catch (error) {
      console.error('Failed to load package info:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const convertToTreeData = (node: any): any => {
    if (!node) return null
    return {
      title: (
        <Space>
          <Tag color="blue">{node.name}</Tag>
          <Text type="secondary">v{node.version}</Text>
        </Space>
      ),
      key: `${node.name}@${node.version}`,
      children: node.dependencies?.map((dep: any) => convertToTreeData(dep)) || []
    }
  }
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const renderDependencies = (deps: Record<string, string> | undefined, title: string) => {
    if (!deps || Object.keys(deps).length === 0) return null
    
    return (
      <div style={{ marginTop: 16 }}>
        <Text strong>{title}:</Text>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(deps).map(([name, version]) => (
            <Tag key={name}>{name}@{version}</Tag>
          ))}
        </div>
      </div>
    )
  }
  
  const TabItems = [
    {
      key: 'info',
      label: '基本信息',
      icon: <InfoCircleOutlined />,
      children: (
        <Spin spinning={loading}>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="安装大小"
                  value={sizeInfo?.prettySize || '未知'}
                  prefix={<DownloadOutlined />}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="文件数量"
                  value={sizeInfo?.fileCount || 0}
                  suffix="个文件"
                />
              </Card>
            </Col>
          </Row>
          
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="周下载量"
                  value={downloads?.downloads || 0}
                  prefix={<CloudDownloadOutlined />}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="被依赖次数"
                  value={dependents}
                  suffix="个项目"
                />
              </Card>
            </Col>
          </Row>
          
          <Descriptions bordered column={1} style={{ marginTop: 16 }} size="small">
            <Descriptions.Item label="包名">{packageInfo?.name}</Descriptions.Item>
            <Descriptions.Item label="当前版本">
              <Space>
                <Tag color="blue">v{packageInfo?.version}</Tag>
                <Text type="secondary">
                  发布于 {formatDate(packageInfo?.time?.[packageInfo?.version || ''] || '')}
                </Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="描述">
              {packageInfo?.description || '暂无描述'}
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {typeof packageInfo?.author === 'string' 
                ? packageInfo.author 
                : packageInfo?.author?.name || '未知'}
            </Descriptions.Item>
            <Descriptions.Item label="许可证">
              <Tag>{packageInfo?.license || '未知'}</Tag>
            </Descriptions.Item>
            {packageInfo?.homepage && (
              <Descriptions.Item label="主页">
                <a onClick={() => window.electronAPI.openExternal(packageInfo.homepage!)}>
                  {packageInfo.homepage}
                </a>
              </Descriptions.Item>
            )}
            {packageInfo?.repository && (
              <Descriptions.Item label="仓库">
                <a onClick={() => {
                  const url = typeof packageInfo.repository === 'string' 
                    ? packageInfo.repository 
                    : packageInfo.repository.url
                  window.electronAPI.openExternal(url.replace('git+', '').replace('.git', ''))
                }}>
                  {typeof packageInfo.repository === 'string' 
                    ? packageInfo.repository 
                    : packageInfo.repository.url}
                </a>
              </Descriptions.Item>
            )}
            {packageInfo?.keywords && packageInfo.keywords.length > 0 && (
              <Descriptions.Item label="关键词">
                <Space wrap>
                  {packageInfo.keywords.map((keyword) => (
                    <Tag key={keyword}>{keyword}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="维护者">
              <Space wrap>
                {packageInfo?.maintainers?.map((m, index) => (
                  <Tag key={index} color="green">{m.name || m}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
          
          {renderDependencies(packageInfo?.dependencies, '运行时依赖')}
          {renderDependencies(packageInfo?.devDependencies, '开发依赖')}
        </Spin>
      )
    },
    {
      key: 'versions',
      label: '版本历史',
      icon: <FileTextOutlined />,
      children: (
        <Spin spinning={loading}>
          <div style={{ marginBottom: 16 }}>
            <Text>共 {versions.length} 个版本</Text>
          </div>
          <Collapse accordion>
            {versions.slice(0, 20).map((version) => (
              <Panel 
                header={
                  <Space>
                    <Tag color={version === packageInfo?.version ? 'blue' : 'default'}>
                      v{version}
                    </Tag>
                    {packageInfo?.time?.[version] && (
                      <Text type="secondary">
                        {formatDate(packageInfo.time[version])}
                      </Text>
                    )}
                  </Space>
                }
                key={version}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>版本: {version}</Text>
                  <Text type="secondary">
                    发布时间: {formatDate(packageInfo?.time?.[version] || '')}
                  </Text>
                  <Button 
                    type="primary" 
                    size="small"
                    onClick={() => onInstall?.(version)}
                  >
                    安装此版本
                  </Button>
                </Space>
              </Panel>
            ))}
          </Collapse>
        </Spin>
      )
    },
    {
      key: 'dependencies',
      label: '依赖树',
      icon: <ApartmentOutlined />,
      children: (
        <Spin spinning={loading}>
          {dependencyTree?.dependencies?.length > 0 ? (
            <>
              <Alert
                message={`此包有 ${dependencyTree.dependencies.length} 个直接依赖`}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Tree
                treeData={[convertToTreeData(dependencyTree)]}
                defaultExpandAll
                showLine
              />
            </>
          ) : (
            <Alert
              message="此包没有运行时依赖"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          )}
        </Spin>
      )
    },
    {
      key: 'readme',
      label: 'README',
      icon: <FileTextOutlined />,
      children: (
        <Spin spinning={loading}>
          <div className="readme-content" style={{ 
            maxHeight: 400, 
            overflow: 'auto',
            padding: 16,
            background: 'var(--bg-tertiary, #252526)',
            borderRadius: 8
          }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
              {readme}
            </pre>
          </div>
        </Spin>
      )
    }
  ]
  
  return (
    <Modal
      title={
        <Space>
          <Tag color="blue">{packageName}</Tag>
          {sizeInfo?.prettySize && (
            <Tag color="green" icon={<DownloadOutlined />}>
              {sizeInfo.prettySize}
            </Tag>
          )}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button 
            type="primary" 
            onClick={() => onInstall?.()}
          >
            安装最新版
          </Button>
        </Space>
      }
      width={800}
    >
      <Tabs items={TabItems} />
    </Modal>
  )
}