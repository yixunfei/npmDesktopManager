import React, { useState } from 'react'
import { Input, Button, Empty, Spin, Modal, Tag, message, Space, Table, Tooltip, Dropdown } from 'antd'
import { SearchOutlined, FolderOpenOutlined, HistoryOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useSearchStore } from '../../stores/searchStore'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore } from '../../stores/packageStore'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import styles from './Search.module.css'

const { Search } = Input

const SearchPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPackageName, setSelectedPackageName] = useState<string>('')
  const [detailVisible, setDetailVisible] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [versionVisible, setVersionVisible] = useState(false)
  const [versionPackageName, setVersionPackageName] = useState<string>('')
  const [packageSizes, setPackageSizes] = useState<Record<string, any>>({})
  
  const { results, loading, search } = useSearchStore()
  const currentPath = useAppStore((state) => state.currentPath)
  const addNotification = useAppStore((state) => state.addNotification)
  const installPackage = usePackageStore((state) => state.installPackage)
  const fetchProjectPackages = usePackageStore((state) => state.fetchProjectPackages)
  
  React.useEffect(() => {
    if (results.length > 0) {
      loadPackageSizes()
    }
  }, [results])
  
  const loadPackageSizes = async () => {
    const entries = await Promise.all(
      results.slice(0, 20).map(async (pkg) => {
        try {
          const size = await window.electronAPI.npm.getPackageSize(pkg.name, pkg.version)
          return [pkg.name, size] as const
        } catch {
          return null
        }
      })
    )
    const sizes = Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, any]>)
    setPackageSizes(sizes)
  }
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      message.warning('请输入搜索关键词')
      return
    }
    await search(searchQuery)
  }
  
  const handleInstall = async (packageName: string, version?: string) => {
    try {
      await installPackage({
        packageName,
        cwd: currentPath,
        version
      })
      addNotification({
        type: 'success',
        message: '安装成功',
        description: `${packageName} 已成功安装`
      })
      await fetchProjectPackages(currentPath)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '安装失败',
        description: error.message
      })
    }
  }
  
  const handleShowVersions = async (packageName: string) => {
    setVersionPackageName(packageName)
    try {
      const versionList = await window.electronAPI.npm.getVersions(packageName)
      setVersions(versionList)
      setVersionVisible(true)
    } catch (error: any) {
      message.error('获取版本列表失败')
    }
  }
  
  const handleInstallVersion = async (version: string) => {
    await handleInstall(versionPackageName, version)
    setVersionVisible(false)
  }
  
  const handleSelectDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (path) {
      useAppStore.getState().setCurrentPath(path)
      addNotification({
        type: 'info',
        message: '已切换项目路径',
        description: path
      })
    }
  }
  
  const handleShowDetail = (packageName: string) => {
    setSelectedPackageName(packageName)
    setDetailVisible(true)
  }
  
  const handleInstallFromDetail = async (version?: string) => {
    await handleInstall(selectedPackageName, version)
    setDetailVisible(false)
  }
  
  const columns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => (
        <Button 
          type="link" 
          size="small" 
          style={{ padding: 0 }}
          onClick={() => handleShowDetail(text)}
        >
          <Tag color="blue">{text}</Tag>
        </Button>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (text: string) => <Tag>v{text}</Tag>
    },
    {
      title: '大小',
      key: 'size',
      width: 90,
      render: (_: any, record: any) => {
        const size = packageSizes[record.name]
        return size ? (
          <Tooltip title={`${size.fileCount} 个文件`}>
            <Tag icon={<DownloadOutlined />}>{size.prettySize}</Tag>
          </Tooltip>
        ) : '-'
      }
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 120,
      ellipsis: true,
      render: (author: any) => {
        if (!author) return '-'
        return typeof author === 'string' ? author : author.name || '-'
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" type="primary" onClick={() => handleInstall(record.name)}>
            安装
          </Button>
          <Tooltip title="选择版本">
            <Button size="small" onClick={() => handleShowVersions(record.name)}>
              版本
            </Button>
          </Tooltip>
          <Dropdown menu={{
            items: [
              { key: 'detail', label: '查看详情', icon: <InfoCircleOutlined /> },
              { key: 'changelog', label: '更新日志', icon: <HistoryOutlined /> }
            ],
            onClick: ({ key }) => {
              if (key === 'detail') {
                handleShowDetail(record.name)
              } else if (key === 'changelog') {
                handleViewChangelog(record.name)
              }
            }
          }}>
            <Button size="small">更多</Button>
          </Dropdown>
        </Space>
      )
    }
  ]
  
  const handleViewChangelog = async (packageName: string) => {
    try {
      const info = await window.electronAPI.npm.getPackageInfo(packageName)
      if (info?.homepage) {
        await window.electronAPI.openExternal(info.homepage)
      } else if (info?.repository?.url) {
        let url = info.repository.url
        if (url.startsWith('git+')) {
          url = url.replace('git+', '').replace('.git', '')
        }
        if (url.includes('github.com')) {
          await window.electronAPI.openExternal(`${url}/releases`)
        } else {
          await window.electronAPI.openExternal(url)
        }
      } else {
        await window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
      }
    } catch {
      await window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
    }
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>搜索包</h2>
        <div className={styles.pathInfo}>
          <span className={styles.pathLabel}>当前路径:</span>
          <span className={styles.pathValue}>{currentPath}</span>
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={handleSelectDirectory}
          >
            选择目录
          </Button>
        </div>
      </div>
      
      <div className={styles.searchBox}>
        <Search
          placeholder="搜索 npm 包..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onSearch={handleSearch}
          enterButton={<><SearchOutlined /> 搜索</>}
          size="large"
          loading={loading}
        />
      </div>
      
      <div className={styles.results}>
        <Spin spinning={loading}>
          {results.length === 0 ? (
            <Empty description="搜索包以查看结果" />
          ) : (
            <Table
              dataSource={results}
              columns={columns}
              rowKey="name"
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 900 }}
            />
          )}
        </Spin>
      </div>
      
      <PackageDetailModal
        visible={detailVisible}
        packageName={selectedPackageName}
        onClose={() => setDetailVisible(false)}
        onInstall={handleInstallFromDetail}
      />
      
      <Modal
        title={`选择版本 - ${versionPackageName}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={500}
      >
        <div className={styles.versionList}>
          <Spin spinning={versions.length === 0}>
            <div className={styles.versions}>
              {versions.slice(0, 50).map(version => (
                <Tag 
                  key={version}
                  className={styles.versionTag}
                  onClick={() => handleInstallVersion(version)}
                >
                  {version}
                </Tag>
              ))}
            </div>
          </Spin>
        </div>
      </Modal>
    </div>
  )
}

export default SearchPage
