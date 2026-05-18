import React, { useEffect, useState } from 'react'
import { AutoComplete, Button, Descriptions, Empty, Spin, Modal, Form, Select, Tag, Dropdown, Space, Tooltip, Table } from 'antd'
import { ReloadOutlined, PlusOutlined, SwapOutlined, FolderFilled, SyncOutlined, CheckCircleOutlined, WarningOutlined, HistoryOutlined, ApartmentOutlined, InfoCircleOutlined, SecurityScanOutlined, FolderOpenOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore, PackageInfo } from '../../stores/packageStore'
import { resolvePackageUpdateTarget, useSettingsStore } from '../../stores/settingsStore'
import { DependencyTreeModal } from '../../components/Package/DependencyTreeModal'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import { BatchVersionPreviewModal } from '../../components/Package/BatchVersionPreviewModal'
import { SecurityAuditModal } from '../../components/Package/SecurityAuditModal'
import { NpmVersionPicker } from '../../components/Package/NpmVersionPicker'
import { localizedModal } from '../../utils/localizedFeedback'
import { VERSION_PAGE_SIZE, VersionChannelFilter, toVersionOptions, versionsForFilter } from '../../utils/npmVersions'
import { cleanPackageSummary, formatCompactNumber } from '../../utils/npmDisplay'
import styles from './Global.module.css'

const SEARCH_PAGE_SIZE = 10

const GlobalPage: React.FC = () => {
  const [installVisible, setInstallVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [versions, setVersions] = useState<string[]>([])
  const [versionMetadata, setVersionMetadata] = useState<NpmVersionMetadata | null>(null)
  const [stableVersionPage, setStableVersionPage] = useState(1)
  const [prereleaseVersionPage, setPrereleaseVersionPage] = useState(1)
  const [installForm] = Form.useForm()
  const [checkingAll, setCheckingAll] = useState(false)
  const [depTreeVisible, setDepTreeVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailPackage, setDetailPackage] = useState<string>('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [updatingSelected, setUpdatingSelected] = useState(false)
  const [uninstallingSelected, setUninstallingSelected] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState<PackageInfo[]>([])
  const [auditVisible, setAuditVisible] = useState(false)
  const [packageOptions, setPackageOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [packageSearchQuery, setPackageSearchQuery] = useState('')
  const [packageSearchPage, setPackageSearchPage] = useState(1)
  const [packageSearchHasMore, setPackageSearchHasMore] = useState(false)
  const [packageSearchLoadingMore, setPackageSearchLoadingMore] = useState(false)
  const [installVersionOptions, setInstallVersionOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [installVersionMetadata, setInstallVersionMetadata] = useState<NpmVersionMetadata | null>(null)
  const [installVersionFilter, setInstallVersionFilter] = useState<VersionChannelFilter>('stable')
  const [installVersionPage, setInstallVersionPage] = useState(1)
  const [globalPrefix, setGlobalPrefix] = useState('')
  const [cachePath, setCachePath] = useState('')
  
  const addNotification = useAppStore((state) => state.addNotification)
  const updateStrategy = useSettingsStore((state) => state.updateStrategy)
  const { globalPackages, loading, fetchGlobalPackages, installPackage, uninstallPackage, installSpecificVersion } = usePackageStore()
  
  useEffect(() => {
    fetchGlobalPackages()
    loadGlobalMeta()
  }, [])

  const loadGlobalMeta = async () => {
    try {
      const [prefix, cache] = await Promise.all([
        window.electronAPI.npm.configGet('prefix'),
        window.electronAPI.system.getCachePath()
      ])
      setGlobalPrefix(prefix)
      setCachePath(cache)
    } catch {
      setGlobalPrefix('')
      setCachePath('')
    }
  }
  
  const handleRefresh = async () => {
    await fetchGlobalPackages()
    await loadGlobalMeta()
    addNotification({
      type: 'success',
      message: '刷新成功'
    })
  }
  
  const handleCheckAllOutdated = async () => {
    setCheckingAll(true)
    try {
      await fetchGlobalPackages()
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
   
  const handleUninstall = async (packageName: string) => {
    try {
      await uninstallPackage({
        packageName,
        global: true
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
        global: true,
        version: values.version
      })
      addNotification({
        type: 'success',
        message: '安装成功',
        description: `${values.package} 已成功安装到全局`
      })
      setInstallVisible(false)
      installForm.resetFields()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '安装失败',
        description: error.message
      })
    }
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
        global: true
      })
      addNotification({
        type: 'success',
        message: '版本切换成功',
        description: `${selectedPackage.name}@${version} 已安装`
      })
      setVersionVisible(false)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '版本切换失败',
        description: error.message
      })
    }
  }
  
  const handleOpenPackagePath = async (packageName: string) => {
    try {
      const path = `${globalPrefix || await window.electronAPI.npm.configGet('prefix')}/node_modules/${packageName}`
      await window.electronAPI.system.openPath(path)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '打开路径失败',
        description: error.message
      })
    }
  }
  
  const handleUpdate = async (packageName: string) => {
    const pkg = globalPackages.find(p => p.name === packageName)
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
            global: true,
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
      await fetchGlobalPackages(true)
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

  const handleUpdateSelected = async () => {
    if (selectedRowKeys.length === 0) {
      addNotification({
        type: 'warning',
        message: '请先选择要更新的包'
      })
      return
    }

    const packagesToUpdate = globalPackages.filter(pkg => 
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

  const handleUpdateAll = async () => {
    const outdatedPackages = globalPackages.filter(pkg => pkg.outdated)
    
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
                global: true
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
          await fetchGlobalPackages(true)
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
      width: 200,
      render: (text: string, record: PackageInfo) => (
        <Space>
          <span className={styles.pkgName}>{text}</span>
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
      title: '当前版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (text: string) => <Tag>v{text}</Tag>
    },
    {
      title: '最新版本',
      dataIndex: 'latest',
      key: 'latest',
      width: 120,
      render: (text: string, record: PackageInfo) => 
        text ? (
          <Space>
            <Tag color={text !== record.version ? 'blue' : 'green'}>
              v{text}
            </Tag>
            {text !== record.version && (
              <Tooltip title="查看更新日志">
                <Button 
                  size="small" 
                  type="link" 
                  icon={<HistoryOutlined />}
                  onClick={() => handleViewChangelog(record.name)}
                />
              </Tooltip>
            )}
          </Space>
        ) : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
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
              { key: 'open', label: '打开文件路径', icon: <FolderFilled /> },
              { key: 'changelog', label: '查看更新日志', icon: <HistoryOutlined /> },
              { key: 'uninstall', label: '卸载', icon: <ReloadOutlined />, danger: true }
            ],
            onClick: ({ key }) => {
              if (key === 'detail') {
                setDetailPackage(record.name)
                setDetailVisible(true)
              } else if (key === 'version') {
                handleShowVersions(record)
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
        <h2 className={styles.title}>全局依赖</h2>
        <div className={styles.actions}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInstallVisible(true)}>
            全局安装包
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
            icon={<ApartmentOutlined />} 
            onClick={() => setDepTreeVisible(true)}
          >
            依赖树
          </Button>
          <Button icon={<SecurityScanOutlined />} onClick={() => setAuditVisible(true)}>
            安全审计
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            刷新
          </Button>
        </div>
      </div>
      
      <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="全局前缀">
          <Space>
            <span>{globalPrefix || '-'}</span>
            {globalPrefix && (
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.system.openPath(globalPrefix)}>
                打开
              </Button>
            )}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="npm 缓存">
          <Space>
            <span>{cachePath || '-'}</span>
            {cachePath && (
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.system.openPath(cachePath)}>
                打开
              </Button>
            )}
          </Space>
        </Descriptions.Item>
      </Descriptions>

      <div className={styles.content}>
        <Spin spinning={loading}>
          {globalPackages.length === 0 ? (
            <Empty description="暂无全局依赖" />
          ) : (
            <Table 
              dataSource={globalPackages}
              columns={columns}
              rowKey="name"
              size="small"
              pagination={false}
              rowSelection={rowSelection}
            />
          )}
        </Spin>
      </div>
      
      <Modal
        title="全局安装包"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="安装"
        cancelText="取消"
      forceRender
      >
        <Form form={installForm} onFinish={handleInstall} layout="vertical">
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
              placeholder="例如: typescript"
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
          <p style={{ marginBottom: 12, color: '#999' }}>
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
      
      <DependencyTreeModal
        visible={depTreeVisible}
        type="global"
        onClose={() => setDepTreeVisible(false)}
      />
      
      <PackageDetailModal
        visible={detailVisible}
        packageName={detailPackage}
        onClose={() => setDetailVisible(false)}
      />
      
      <BatchVersionPreviewModal
        visible={previewVisible}
        packages={pendingUpdates}
        onConfirm={executeUpdate}
        onCancel={() => setPreviewVisible(false)}
      />

      <SecurityAuditModal
        visible={auditVisible}
        scope="global"
        onClose={() => setAuditVisible(false)}
      />
    </div>
  )
}

export default GlobalPage

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
