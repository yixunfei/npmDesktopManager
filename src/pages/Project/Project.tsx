import React, { useEffect, useState } from 'react'
import { AutoComplete, Button, Empty, Spin, Modal, Form, Input, Switch, Select, Tag, Dropdown, Space, Tooltip, Table, Tabs, Card } from 'antd'
import { ReloadOutlined, FolderOpenOutlined, PlusOutlined, SwapOutlined, FolderFilled, PlayCircleOutlined, CheckCircleOutlined, WarningOutlined, SyncOutlined, HistoryOutlined, SecurityScanOutlined, InfoCircleOutlined, DownloadOutlined, ApartmentOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore, PackageInfo } from '../../stores/packageStore'
import { resolvePackageUpdateTarget, useSettingsStore } from '../../stores/settingsStore'
import { useCommandLogStore } from '../../stores/commandLogStore'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import { SecurityAuditModal } from '../../components/Package/SecurityAuditModal'
import { DependencyTreeModal } from '../../components/Package/DependencyTreeModal'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import { BatchVersionPreviewModal } from '../../components/Package/BatchVersionPreviewModal'
import { NpmVersionPicker } from '../../components/Package/NpmVersionPicker'
import ProjectToolchainPanel from '../../components/Toolchain/ProjectToolchainPanel'
import ProjectPathBar from '../../components/ProjectPathBar/ProjectPathBar'
import { localizedModal } from '../../utils/localizedFeedback'
import { VERSION_PAGE_SIZE, VersionChannelFilter, toVersionOptions, versionsForFilter } from '../../utils/npmVersions'
import { cleanPackageSummary, formatCompactNumber } from '../../utils/npmDisplay'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './Project.module.css'

const SEARCH_PAGE_SIZE = 10

interface ProjectPageProps {
  hideToolchainPanel?: boolean
  hideProjectSelector?: boolean
}

const ProjectPage: React.FC<ProjectPageProps> = ({ hideToolchainPanel = false, hideProjectSelector = false }) => {
  const [installVisible, setInstallVisible] = useState(false)
  const [moveDepVisible, setMoveDepVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [installForm] = Form.useForm()
  const [moveDepForm] = Form.useForm()
  const [scripts, setScripts] = useState<string[]>([])
  const [runningScript, setRunningScript] = useState<string>('')
  const [scriptOutput, setScriptOutput] = useState<string>('')
  const [scriptOutputVisible, setScriptOutputVisible] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [versions, setVersions] = useState<string[]>([])
  const [versionMetadata, setVersionMetadata] = useState<NpmVersionMetadata | null>(null)
  const [stableVersionPage, setStableVersionPage] = useState(1)
  const [prereleaseVersionPage, setPrereleaseVersionPage] = useState(1)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailPackage, setDetailPackage] = useState<string>('')
  const [auditVisible, setAuditVisible] = useState(false)
  const [depTreeVisible, setDepTreeVisible] = useState(false)
  const [healthVisible, setHealthVisible] = useState(false)
  const [packageSizes, setPackageSizes] = useState<Record<string, any>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [updatingSelected, setUpdatingSelected] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState<PackageInfo[]>([])
  const [uninstallingSelected, setUninstallingSelected] = useState(false)
  const [packageOptions, setPackageOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [packageSearchQuery, setPackageSearchQuery] = useState('')
  const [packageSearchPage, setPackageSearchPage] = useState(1)
  const [packageSearchHasMore, setPackageSearchHasMore] = useState(false)
  const [packageSearchLoadingMore, setPackageSearchLoadingMore] = useState(false)
  const [installVersionOptions, setInstallVersionOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [installVersionMetadata, setInstallVersionMetadata] = useState<NpmVersionMetadata | null>(null)
  const [installVersionFilter, setInstallVersionFilter] = useState<VersionChannelFilter>('stable')
  const [installVersionPage, setInstallVersionPage] = useState(1)
  
  const currentPath = useAppStore((state) => state.currentPath)
  const addNotification = useAppStore((state) => state.addNotification)
  const updateStrategy = useSettingsStore((state) => state.updateStrategy)
  const setTerminalVisible = useCommandLogStore((state) => state.setVisible)
  const { projectPackages, loading, fetchProjectPackages, installPackage, uninstallPackage, installSpecificVersion } = usePackageStore()

  useDependencyHealthReminder('npm', currentPath, !!currentPath && projectPackages.length > 0)
  
  useEffect(() => {
    if (currentPath) {
      fetchProjectPackages(currentPath)
      loadScripts()
      startWatcher()
    }
    
    return () => {
      stopWatcher()
    }
  }, [currentPath])
  
  const startWatcher = async () => {
    if (currentPath) {
      // 先检查是否是有效的项目路径
      try {
        const projectInfo = await window.electronAPI.project.detect(currentPath)
        if (projectInfo.hasPackageJson) {
          await window.electronAPI.watcher.start(currentPath)
          window.electronAPI.watcher.onChange((data) => {
            if (data.type === 'package.json' && data.path === currentPath) {
              addNotification({
                type: 'info',
                message: 'package.json 已变更',
                description: '正在自动刷新...'
              })
              fetchProjectPackages(currentPath, true)
              loadScripts()
            }
          })
        }
      } catch (error) {
        console.warn('Failed to start watcher:', error)
      }
    }
  }
  
  const stopWatcher = () => {
    window.electronAPI.watcher.stop()
    window.electronAPI.watcher.removeChangeListener()
  }
  
  useEffect(() => {
    if (projectPackages.length > 0) {
      loadPackageSizes()
    }
  }, [projectPackages])
  
  const loadScripts = async () => {
    try {
      const result = await window.electronAPI.npm.getScripts(currentPath)
      setScripts(result)
    } catch (error) {
      setScripts([])
    }
  }
  
  const loadPackageSizes = async () => {
    const entries = await Promise.all(
      projectPackages.slice(0, 20).map(async (pkg) => {
        if (pkg.size) {
          return [pkg.name, { prettySize: pkg.size, fileCount: pkg.fileCount || 0 }] as const
        }

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
  
  const handleRefresh = async () => {
    await fetchProjectPackages(currentPath)
    await loadScripts()
    addNotification({
      type: 'success',
      message: '刷新成功'
    })
  }
  
  const handleUpdate = async (packageName: string) => {
    const pkg = projectPackages.find(p => p.name === packageName)
    if (pkg) {
      setPendingUpdates([pkg])
      setPreviewVisible(true)
    }
  }

  const executeUpdate = async (selectedPackages: string[]) => {
    setPreviewVisible(false)
    setUpdatingSelected(true)
    let successCount = 0
    let failCount = 0

    try {
      for (const packageName of selectedPackages) {
        try {
          const pkg = pendingUpdates.find((item) => item.name === packageName)
          const targetVersion = pkg ? resolvePackageUpdateTarget(pkg, updateStrategy) : undefined
          await window.electronAPI.npm.update({
            packageName,
            cwd: currentPath,
            version: targetVersion
          })
          successCount++
        } catch {
          failCount++
        }
      }

      addNotification({
        type: successCount > 0 ? 'success' : 'info',
        message: '批量更新完成',
        description: `成功: ${successCount}, 失败: ${failCount}`
      })

      setSelectedRowKeys([])
      await fetchProjectPackages(currentPath, true)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '批量更新失败',
        description: error.message
      })
    } finally {
      setUpdatingSelected(false)
    }
  }
  
  const handleUninstall = async (packageName: string) => {
    try {
      await uninstallPackage({
        packageName,
        cwd: currentPath
      })
      addNotification({
        type: 'success',
        message: '卸载成功',
        description: `${packageName} 已卸载`
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '卸载失败',
        description: error.message
      })
    }
  }
  
  const handleInstall = async (values: any) => {
    try {
      await installPackage({
        packageName: values.package,
        cwd: currentPath,
        dev: values.dev,
        version: values.version
      })
      addNotification({
        type: 'success',
        message: '安装成功',
        description: `${values.package} 已成功安装`
      })
      setInstallVisible(false)
      installForm.resetFields()
      await loadScripts()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '安装失败',
        description: error.message
      })
    }
  }
  
  const handleMoveDep = async (values: any) => {
    try {
      await window.electronAPI.npm.moveDep({
        packageName: values.packageName,
        cwd: currentPath,
        from: values.from,
        to: values.to
      })
      addNotification({
        type: 'success',
        message: '依赖类型已切换',
        description: `${values.packageName} 已从 ${values.from} 移动到 ${values.to}`
      })
      setMoveDepVisible(false)
      moveDepForm.resetFields()
      await fetchProjectPackages(currentPath)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '切换失败',
        description: error.message
      })
    }
  }
  
  const handleOpenPackagePath = async (packageName: string) => {
    try {
      const path = await window.electronAPI.project.getNodeModulesPath(currentPath, packageName)
      await window.electronAPI.system.openPath(path)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '打开路径失败',
        description: error.message
      })
    }
  }
  
  const handleOpenPackageJson = async () => {
    try {
      const path = await window.electronAPI.project.getPackagePath(currentPath)
      await window.electronAPI.system.openFile(path)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '打开package.json失败',
        description: error.message
      })
    }
  }
  
  const handleOpenTerminal = async () => {
    setTerminalVisible(true)
    addNotification({
      type: 'success',
      message: '终端已打开',
      description: currentPath
    })
  }

  const searchInstallPackages = async (query: string) => {
    if (!query.trim()) {
      setPackageOptions([])
      setPackageSearchQuery('')
      setPackageSearchPage(1)
      setPackageSearchHasMore(false)
      return
    }
    await loadPackageOptions(query, 1)
  }

  const loadPackageOptions = async (query: string, page: number) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return
    try {
      const limit = page * SEARCH_PAGE_SIZE
      const result = await window.electronAPI.npm.search(trimmedQuery, limit + 1)
      const packages = uniqueByName(result)
      const visiblePackages = packages.slice(0, limit)
      const downloads = await loadSearchDownloads(visiblePackages)
      const hasMore = packages.length > visiblePackages.length
      setPackageSearchQuery(trimmedQuery)
      setPackageSearchPage(page)
      setPackageSearchHasMore(hasMore)
      setPackageOptions(buildPackageOptions(visiblePackages, downloads))
    } catch {
      setPackageOptions([])
      setPackageSearchHasMore(false)
    }
  }

  const loadMorePackageOptions = async () => {
    if (!packageSearchQuery || !packageSearchHasMore || packageSearchLoadingMore) return
    setPackageSearchLoadingMore(true)
    try {
      await loadPackageOptions(packageSearchQuery, packageSearchPage + 1)
    } finally {
      setPackageSearchLoadingMore(false)
    }
  }

  const loadInstallVersions = async () => {
    const packageName = installForm.getFieldValue('package')
    if (!packageName) return
    const rawName = String(packageName)
    const versionMark = rawName.startsWith('@') ? rawName.indexOf('@', 1) : rawName.indexOf('@')
    const name = versionMark > 0 ? rawName.slice(0, versionMark) : rawName
    const metadata = await window.electronAPI.npm.getVersionMetadata(name)
    setInstallVersionMetadata(metadata)
    setInstallVersionPage(1)
    const options = buildInstallVersionOptions(metadata, installVersionFilter, 1)
    setInstallVersionOptions(options)
    if (options[0]) {
      installForm.setFieldValue('version', options[0].value)
    }
  }

  const handleInstallVersionFilterChange = (filter: VersionChannelFilter) => {
    setInstallVersionFilter(filter)
    setInstallVersionPage(1)
    if (installVersionMetadata) {
      const options = buildInstallVersionOptions(installVersionMetadata, filter, 1)
      setInstallVersionOptions(options)
      installForm.setFieldValue('version', options[0]?.value)
    }
  }

  const loadMoreInstallVersions = () => {
    if (!installVersionMetadata) return
    if (versionsForFilter(installVersionMetadata, installVersionFilter).length <= installVersionPage * VERSION_PAGE_SIZE) return
    const nextPage = installVersionPage + 1
    setInstallVersionPage(nextPage)
    setInstallVersionOptions(buildInstallVersionOptions(installVersionMetadata, installVersionFilter, nextPage))
  }

  const handlePackagePopupScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!isNearPopupBottom(event.currentTarget)) return
    void loadMorePackageOptions()
  }

  const handleVersionPopupScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!isNearPopupBottom(event.currentTarget)) return
    loadMoreInstallVersions()
  }
  
  const handleRunScript = async (script: string) => {
    setRunningScript(script)
    setScriptOutputVisible(true)
    setScriptOutput('正在执行...')
    
    try {
      const output = await window.electronAPI.npm.runScript(currentPath, script)
      setScriptOutput(output)
      addNotification({
        type: 'success',
        message: '脚本执行完成',
        description: `npm run ${script}`
      })
    } catch (error: any) {
      setScriptOutput(`执行失败: ${error.message}`)
      addNotification({
        type: 'error',
        message: '脚本执行失败',
        description: error.message
      })
    } finally {
      setRunningScript('')
    }
  }
  
  const handleCheckAllOutdated = async () => {
    setCheckingAll(true)
    try {
      await fetchProjectPackages(currentPath)
      addNotification({
        type: 'success',
        message: '检查完成'
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '检查失败',
        description: error.message
      })
    } finally {
      setCheckingAll(false)
    }
  }
  
  const handleUpdateAll = async () => {
    const outdatedPackages = projectPackages.filter(pkg => pkg.outdated)
    
    if (outdatedPackages.length === 0) {
      addNotification({
        type: 'info',
        message: '所有包已是最新版本'
      })
      return
    }

    setPendingUpdates(outdatedPackages)
    setPreviewVisible(true)
  }

  const handleUpdateSelected = async () => {
    if (selectedRowKeys.length === 0) {
      addNotification({
        type: 'warning',
        message: '请先选择要更新的包'
      })
      return
    }

    const packagesToUpdate = projectPackages.filter(pkg => 
      selectedRowKeys.includes(pkg.name) && pkg.outdated
    )
    
    if (packagesToUpdate.length === 0) {
      addNotification({
        type: 'warning',
        message: '没有可更新的包'
      })
      return
    }

    setPendingUpdates(packagesToUpdate)
    setPreviewVisible(true)
  }

  const handleUninstallSelected = async () => {
    if (selectedRowKeys.length === 0) {
      addNotification({
        type: 'warning',
        message: '请先选择要卸载的包'
      })
      return
    }

    localizedModal.confirm({
      title: '确认批量卸载',
      content: `确定要卸载选中的 ${selectedRowKeys.length} 个包吗？`,
      onOk: async () => {
        setUninstallingSelected(true)
        let successCount = 0
        let failCount = 0

        try {
          for (const packageName of selectedRowKeys) {
            try {
              await window.electronAPI.npm.uninstall({
                packageName: packageName as string,
                cwd: currentPath
              })
              successCount++
            } catch {
              failCount++
            }
          }

          addNotification({
            type: successCount > 0 ? 'success' : 'error',
            message: '批量卸载完成',
            description: `成功: ${successCount}, 失败: ${failCount}`
          })

          setSelectedRowKeys([])
          await fetchProjectPackages(currentPath, true)
        } catch (error: any) {
          addNotification({
            type: 'error',
            message: '批量卸载失败',
            description: error.message
          })
        } finally {
          setUninstallingSelected(false)
        }
      }
    })
  }
  
  const handleShowVersions = async (pkg: PackageInfo) => {
    setSelectedPackage(pkg)
    setVersionMetadata(null)
    setVersions([])
    setStableVersionPage(1)
    setPrereleaseVersionPage(1)
    try {
      const metadata = await window.electronAPI.npm.getVersionMetadata(pkg.name)
      setVersionMetadata(metadata)
      setVersions(metadata.versions.map((version) => version.version))
      setVersionVisible(true)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '获取版本列表失败',
        description: error.message
      })
    }
  }
  
  const handleInstallVersion = async (version: string) => {
    if (!selectedPackage) return
    
    try {
      await installSpecificVersion({
        packageName: selectedPackage.name,
        version,
        cwd: currentPath,
        dev: selectedPackage.type === 'devDependencies'
      })
      addNotification({
        type: 'success',
        message: '版本切换成功',
        description: `${selectedPackage.name}@${version} 已安装`
      })
      setVersionVisible(false)
      await fetchProjectPackages(currentPath)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '版本切换失败',
        description: error.message
      })
    }
  }
  
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
    } catch (error: any) {
      await window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
    }
  }
  
  const handleShowDetail = (packageName: string) => {
    setDetailPackage(packageName)
    setDetailVisible(true)
  }
  
  const handleInstallFromDetail = async (version?: string) => {
    if (version) {
      await installSpecificVersion({
        packageName: detailPackage,
        version,
        cwd: currentPath,
        dev: true
      })
    } else {
      await installPackage({
        packageName: detailPackage,
        cwd: currentPath
      })
    }
    setDetailVisible(false)
    await fetchProjectPackages(currentPath)
  }
  
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys)
    },
  }

  const columns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string, record: PackageInfo) => (
        <Space>
          <Button 
            type="link" 
            size="small" 
            style={{ padding: 0 }}
            onClick={() => handleShowDetail(text)}
          >
            {text}
          </Button>
          {record.outdated && (
            <Tooltip title="有新版本可用">
              <WarningOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
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
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (text: string) => (
        <Tag color={text === 'dependencies' ? 'green' : 'orange'}>
          {text === 'dependencies' ? '生产' : '开发'}
        </Tag>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (text: string) => <Tag>v{text}</Tag>
    },
    {
      title: '最新',
      dataIndex: 'latest',
      key: 'latest',
      width: 80,
      render: (text: string, record: PackageInfo) => 
        text ? (
          <Tag color={text !== record.version ? 'blue' : 'green'}>
            v{text}
          </Tag>
        ) : '-'
    },
    {
      title: '大小',
      key: 'size',
      width: 90,
      render: (_: any, record: PackageInfo) => {
        const size = packageSizes[record.name]
        return size ? (
          <Tooltip title={`${size.fileCount} 个文件`}>
            <Tag icon={<DownloadOutlined />}>{size.prettySize}</Tag>
          </Tooltip>
        ) : '-'
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_: any, record: PackageInfo) => (
        <Space>
          {record.outdated && (
            <Tooltip title="更新">
              <Button size="small" icon={<SyncOutlined />} onClick={() => handleUpdate(record.name)} />
            </Tooltip>
          )}
          <Dropdown menu={{
            items: [
              { key: 'detail', label: '查看详情', icon: <InfoCircleOutlined /> },
              { key: 'version', label: '切换版本', icon: <SwapOutlined /> },
              { key: 'move', label: '切换类型', icon: <SwapOutlined /> },
              { key: 'open', label: '打开路径', icon: <FolderFilled /> },
              { key: 'changelog', label: '更新日志', icon: <HistoryOutlined /> },
              { key: 'uninstall', label: '卸载', icon: <ReloadOutlined />, danger: true }
            ],
            onClick: ({ key }) => {
              if (key === 'detail') {
                handleShowDetail(record.name)
              } else if (key === 'version') {
                handleShowVersions(record)
              } else if (key === 'move') {
                moveDepForm.setFieldsValue({
                  packageName: record.name,
                  from: record.type,
                  to: record.type === 'dependencies' ? 'devDependencies' : 'dependencies'
                })
                setMoveDepVisible(true)
              } else if (key === 'open') {
                handleOpenPackagePath(record.name)
              } else if (key === 'changelog') {
                handleViewChangelog(record.name)
              } else if (key === 'uninstall') {
                localizedModal.confirm({
                  title: '确认卸载',
                  content: `确定要卸载 ${record.name} 吗？`,
                  onOk: () => handleUninstall(record.name)
                })
              }
            }
          }}>
            <Button size="small">更多</Button>
          </Dropdown>
        </Space>
      )
    }
  ]
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>项目依赖</h2>
        <div className={styles.actions}>
          {!hideProjectSelector && <ProjectPathBar compact />}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInstallVisible(true)}>
            安装包
          </Button>
          <Button icon={<CheckCircleOutlined />} onClick={handleCheckAllOutdated} loading={checkingAll}>
            检查更新
          </Button>
          <Button 
            icon={<SyncOutlined />} 
            onClick={handleUpdateSelected}
            loading={updatingSelected}
            disabled={selectedRowKeys.length === 0}
            type={selectedRowKeys.length > 0 ? 'primary' : 'default'}
          >
            更新选中 ({selectedRowKeys.length})
          </Button>
          <Button 
            danger
            icon={<ReloadOutlined />} 
            onClick={handleUninstallSelected}
            loading={uninstallingSelected}
            disabled={selectedRowKeys.length === 0}
          >
            卸载选中 ({selectedRowKeys.length})
          </Button>
          <Button icon={<SyncOutlined />} onClick={handleUpdateAll}>
            更新全部
          </Button>
          <Button 
            icon={<SecurityScanOutlined />} 
            onClick={() => setAuditVisible(true)}
          >
            安全审计
          </Button>
          <Button 
            icon={<ApartmentOutlined />} 
            onClick={() => setDepTreeVisible(true)}
          >
            依赖树
          </Button>
          <Button icon={<WarningOutlined />} onClick={() => setHealthVisible(true)} disabled={!currentPath}>
            依赖诊断
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      {!hideToolchainPanel && (
        <ProjectToolchainPanel projectPath={currentPath} />
      )}
      
      <Tabs items={[
        {
          key: 'deps',
          label: '依赖管理',
          children: (
            <div className={styles.depsContent}>
              <Space style={{ marginBottom: 16 }}>
                <Button icon={<FolderFilled />} onClick={handleOpenPackageJson}>
                  打开 package.json
                </Button>
              </Space>
              
              <Spin spinning={loading}>
                {projectPackages.length === 0 ? (
                  <Empty description="暂无依赖，请选择项目目录或安装新包" />
                ) : (
                  <Table 
                    dataSource={projectPackages}
                    columns={columns}
                    rowKey="name"
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                    rowSelection={rowSelection}
                  />
                )}
              </Spin>
            </div>
          )
        },
        {
          key: 'scripts',
          label: '脚本命令',
          children: (
            <div className={styles.scriptsContent}>
              <Space style={{ marginBottom: 16 }}>
                <Button icon={<FolderOpenOutlined />} onClick={handleOpenTerminal}>
                  打开终端
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadScripts}>
                  刷新脚本
                </Button>
              </Space>
              
              {scripts.length === 0 ? (
                <Empty description="暂无脚本命令" />
              ) : (
                <div className={styles.scriptsList}>
                  {scripts.map(script => (
                    <Card key={script} className={styles.scriptCard}>
                      <div className={styles.scriptName}>{script}</div>
                      <Button 
                        type="primary"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleRunScript(script)}
                        loading={runningScript === script}
                      >
                        运行
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )
        }
      ]} />
      
      <Modal
        title="安装包"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="安装"
        cancelText="取消"
      forceRender
      >
        <Form form={installForm} onFinish={handleInstall} layout="vertical" initialValues={{ dev: false }}>
          <Form.Item name="package" label="包名" rules={[{ required: true, message: '请输入包名' }]}>
            <AutoComplete
              options={packageOptions}
              onSearch={searchInstallPackages}
              onPopupScroll={handlePackagePopupScroll}
              popupRender={(menu) => renderPagedPopup(menu, packageSearchHasMore, packageSearchLoadingMore, SEARCH_PAGE_SIZE)}
              onChange={() => {
                setInstallVersionMetadata(null)
                setInstallVersionOptions([])
                installForm.setFieldValue('version', undefined)
              }}
              placeholder="例如: lodash"
            />
          </Form.Item>
          <Form.Item label="版本（可选）">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete
                  options={installVersionOptions}
                  placeholder="默认 latest，稳定版优先；可加载更多或预览版"
                  style={{ width: '100%' }}
                  onPopupScroll={handleVersionPopupScroll}
                  popupRender={(menu) => renderPagedPopup(
                    menu,
                    !!installVersionMetadata && versionsForFilter(installVersionMetadata, installVersionFilter).length > installVersionPage * VERSION_PAGE_SIZE,
                    false,
                    VERSION_PAGE_SIZE
                  )}
                />
              </Form.Item>
              <Select
                value={installVersionFilter}
                onChange={handleInstallVersionFilterChange}
                style={{ width: 120 }}
                options={[
                  { value: 'stable', label: '稳定版' },
                  { value: 'prerelease', label: '预览版' },
                  { value: 'all', label: '全部' }
                ]}
              />
              <Button onClick={loadInstallVersions}>获取版本</Button>
            </Space.Compact>
            {installVersionMetadata && (
              <Space className={styles.installVersionActions} wrap>
                <Tag color="green">稳定版 {installVersionMetadata.stable.length}</Tag>
                <Tag color="gold">预览版 {installVersionMetadata.prerelease.length}</Tag>
                <Tag>{versionFilterLabel(installVersionFilter)}显示 {Math.min(versionsForFilter(installVersionMetadata, installVersionFilter).length, installVersionPage * VERSION_PAGE_SIZE)}</Tag>
              </Space>
            )}
          </Form.Item>
          <Form.Item name="dev" label="作为开发依赖" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      
      <Modal
        title="切换依赖类型"
        open={moveDepVisible}
        onCancel={() => setMoveDepVisible(false)}
        onOk={() => moveDepForm.submit()}
        okText="切换"
        cancelText="取消"
      forceRender
      >
        <Form form={moveDepForm} onFinish={handleMoveDep} layout="vertical">
          <Form.Item name="packageName" label="包名">
            <Input disabled />
          </Form.Item>
          <Form.Item name="from" label="当前类型">
            <Select disabled>
              <Select.Option value="dependencies">生产依赖</Select.Option>
              <Select.Option value="devDependencies">开发依赖</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="to" label="目标类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="dependencies">生产依赖</Select.Option>
              <Select.Option value="devDependencies">开发依赖</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
      
      <Modal
        title={`切换版本 - ${selectedPackage?.name}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={680}
      >
        <div className={styles.versionList}>
          <p style={{ marginBottom: 12, color: 'var(--text-secondary, #999)' }}>
            当前版本: <Tag color="blue">{selectedPackage?.version}</Tag>
          </p>
          <Spin spinning={versions.length === 0 && !versionMetadata}>
            <NpmVersionPicker
              stable={versionMetadata?.stable || []}
              prerelease={versionMetadata?.prerelease || []}
              currentVersion={selectedPackage?.version}
              latestVersion={versionMetadata?.latest || selectedPackage?.latest}
              stablePage={stableVersionPage}
              prereleasePage={prereleaseVersionPage}
              onStablePageChange={setStableVersionPage}
              onPrereleasePageChange={setPrereleaseVersionPage}
              onSelect={handleInstallVersion}
            />
          </Spin>
        </div>
      </Modal>
      
      <Modal
        title={`执行: npm run ${runningScript}`}
        open={scriptOutputVisible}
        onCancel={() => setScriptOutputVisible(false)}
        footer={null}
        width={700}
      >
        <pre className={styles.scriptOutput}>{scriptOutput}</pre>
      </Modal>
      
      <PackageDetailModal
        visible={detailVisible}
        packageName={detailPackage}
        onClose={() => setDetailVisible(false)}
        onInstall={handleInstallFromDetail}
      />
      
      <SecurityAuditModal
        visible={auditVisible}
        projectPath={currentPath}
        onClose={() => setAuditVisible(false)}
      />
      
      <DependencyTreeModal
        visible={depTreeVisible}
        type="project"
        projectPath={currentPath}
        onClose={() => setDepTreeVisible(false)}
      />

      <DependencyHealthModal
        visible={healthVisible}
        manager="npm"
        cwd={currentPath}
        onClose={() => setHealthVisible(false)}
      />
      
      <BatchVersionPreviewModal
        visible={previewVisible}
        packages={pendingUpdates}
        onConfirm={executeUpdate}
        onCancel={() => setPreviewVisible(false)}
      />
    </div>
  )
}

export default ProjectPage

function uniqueByName(packages: any[]): any[] {
  const seen = new Set<string>()
  return packages.filter((pkg) => {
    const key = String(pkg.name || '').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildInstallVersionOptions(metadata: NpmVersionMetadata, filter: VersionChannelFilter, page: number) {
  const versions = versionsForFilter(metadata, filter)
  return toVersionOptions(versions, page)
}

function buildPackageOptions(packages: any[], downloads: Record<string, number>) {
  return packages.map((pkg: any) => ({
    value: pkg.name,
    label: renderPackageOption(pkg, downloads[pkg.name] || pkg.downloads || 0)
  }))
}

async function loadSearchDownloads(packages: any[]): Promise<Record<string, number>> {
  const entries = await Promise.all(packages.map(async (pkg) => {
    if (pkg.downloads) return [pkg.name, pkg.downloads] as const
    try {
      const stats = await window.electronAPI.npm.downloadStats(pkg.name)
      return [pkg.name, stats.downloads || 0] as const
    } catch {
      return [pkg.name, 0] as const
    }
  }))
  return Object.fromEntries(entries)
}

function renderPackageOption(pkg: any, downloads: number): React.ReactNode {
  return (
    <div className={styles.packageOption}>
      <Space size={6} className={styles.packageOptionHeader}>
        <span className={styles.packageOptionName}>{pkg.name}</span>
        {pkg.version && <Tag>{pkg.version}</Tag>}
        {downloads > 0 && (
          <Tag icon={<CloudDownloadOutlined />}>{formatCompactNumber(downloads)}</Tag>
        )}
      </Space>
      <span className={styles.packageOptionDesc}>{cleanPackageSummary(pkg.description) || '暂无描述'}</span>
    </div>
  )
}

function versionFilterLabel(filter: VersionChannelFilter): string {
  if (filter === 'stable') return '稳定版'
  if (filter === 'prerelease') return '预览版'
  return '全部版本'
}

function isNearPopupBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

function renderPagedPopup(menu: React.ReactElement, hasMore: boolean, loading: boolean, pageSize: number): React.ReactElement {
  return (
    <>
      {menu}
      {(hasMore || loading) && (
        <div className={styles.loadMoreOption}>
          {loading ? '正在加载更多...' : `滑动到底部自动加载，每次 ${pageSize} 个`}
        </div>
      )}
    </>
  )
}
