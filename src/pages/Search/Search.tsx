import React, { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Button, Checkbox, Descriptions, Dropdown, Empty, Input, Modal, Select, Space, Spin, Table, Tag, Tooltip } from 'antd'
import { CloudDownloadOutlined, DownloadOutlined, GlobalOutlined, HistoryOutlined, InfoCircleOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore } from '../../stores/packageStore'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import { NpmVersionPicker } from '../../components/Package/NpmVersionPicker'
import ProjectPathBar from '../../components/ProjectPathBar/ProjectPathBar'
import { localizedMessage as message } from '../../utils/localizedFeedback'
import { formatShortDate, splitVersionStrings } from '../../utils/npmVersions'
import { cleanPackageSummary, formatCompactNumber } from '../../utils/npmDisplay'
import styles from './Search.module.css'

const { Search: SearchInput } = Input

type SearchType = 'npm' | 'pip' | 'maven' | 'cargo' | 'gradle' | 'go' | 'native'

interface SearchItem {
  type: SearchType
  key: string
  name: string
  version?: string
  description?: string
  author?: string
  groupId?: string
  artifactId?: string
  modulePath?: string
  manager?: NativeDependencyManager
  source?: string
  kind?: NativeLibraryKind
  path?: string
  linkage?: string
  latestVersion?: string
  repository?: string
  repositoryUrl?: string
  stars?: number
  downloads?: number
  keywords?: string[]
  date?: string
  publisher?: string
  raw: any
}

interface CoordinateSearchSettings {
  mode: MavenSearchMode
  scope: MavenSearchScope
  source: MavenSearchSource
  customUrl: string
  includeLocal: boolean
}

const SEARCH_TYPE_OPTIONS = [
  { label: 'npm', value: 'npm' },
  { label: 'pip', value: 'pip' },
  { label: 'Maven', value: 'maven' },
  { label: 'Cargo', value: 'cargo' },
  { label: 'Gradle', value: 'gradle' },
  { label: 'Go / GitHub', value: 'go' },
  { label: 'C/C++ Native', value: 'native' }
]

const SEARCH_PLACEHOLDERS: Partial<Record<SearchType, string>> = {
  npm: '搜索 npm 包，例如 react、typescript',
  pip: '搜索 PyPI 包，例如 requests、httpx',
  maven: '搜索 Maven 依赖，例如 spring-core、junit',
  cargo: '搜索 crates.io，例如 serde、tokio',
  gradle: '搜索 Gradle/Maven 依赖，例如 spring-core、junit',
  go: '搜索 GitHub Go 模块，例如 gin 或 github.com/gin-gonic/gin'
}

SEARCH_PLACEHOLDERS.native = 'Search C/C++ libraries, for example openssl, boost, zlib'

const SEARCH_TYPE_COLORS: Partial<Record<SearchType, string>> = {
  npm: 'blue',
  pip: 'cyan',
  maven: 'purple',
  cargo: 'volcano',
  gradle: 'green',
  go: 'geekblue'
}

SEARCH_TYPE_COLORS.native = 'gold'

const COORDINATE_SEARCH_MODES = [
  { label: '前缀', value: 'startsWith' },
  { label: '包含', value: 'contains' },
  { label: '精确', value: 'exact' },
  { label: '关键字', value: 'keyword' }
]

const COORDINATE_SEARCH_SCOPES = [
  { label: 'artifactId', value: 'artifactId' },
  { label: 'groupId', value: 'groupId' },
  { label: '坐标', value: 'coordinate' },
  { label: '全部', value: 'all' }
]

const COORDINATE_SEARCH_SOURCES = [
  { label: 'Maven Central', value: 'mavenCentral' },
  { label: 'Nexus 自定义', value: 'nexus' }
]

const DEFAULT_COORDINATE_SEARCH: CoordinateSearchSettings = {
  mode: 'startsWith',
  scope: 'artifactId',
  source: 'mavenCentral',
  customUrl: '',
  includeLocal: false
}

const SearchPage: React.FC = () => {
  const [searchType, setSearchType] = useState<SearchType>('npm')
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestOptions, setSuggestOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [results, setResults] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [npmVersionMetadata, setNpmVersionMetadata] = useState<NpmVersionMetadata | null>(null)
  const [stableVersionPage, setStableVersionPage] = useState(1)
  const [prereleaseVersionPage, setPrereleaseVersionPage] = useState(1)
  const [versionVisible, setVersionVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null)
  const [npmDetailVisible, setNpmDetailVisible] = useState(false)
  const [npmDetailPackageName, setNpmDetailPackageName] = useState('')
  const [pipDetailVisible, setPipDetailVisible] = useState(false)
  const [pipDetail, setPipDetail] = useState<PipPackageDetail | null>(null)
  const [mavenDetailVisible, setMavenDetailVisible] = useState(false)
  const [mavenDetail, setMavenDetail] = useState<SearchItem | null>(null)
  const [packageSizes, setPackageSizes] = useState<Record<string, any>>({})
  const [packageDownloads, setPackageDownloads] = useState<Record<string, number>>({})
  const [coordinateSearch, setCoordinateSearch] = useState<CoordinateSearchSettings>(DEFAULT_COORDINATE_SEARCH)

  const currentPath = useAppStore((state) => state.currentPath)
  const addNotification = useAppStore((state) => state.addNotification)
  const installPackage = usePackageStore((state) => state.installPackage)
  const fetchProjectPackages = usePackageStore((state) => state.fetchProjectPackages)

  useEffect(() => {
    setResults([])
    setPackageSizes({})
    setPackageDownloads({})
    setVersions([])
    setNpmVersionMetadata(null)
    setStableVersionPage(1)
    setPrereleaseVersionPage(1)
    setVersionVisible(false)
    setSelectedItem(null)
    setPipDetail(null)
    setMavenDetail(null)
    setSuggestOptions([])
  }, [searchType])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSuggestOptions([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const items = await searchPackages(searchType, query, currentPath, coordinateSearch)
        if (!cancelled) {
          setSuggestOptions(toSuggestionOptions(items, searchType))
        }
      } catch {
        if (!cancelled) {
          setSuggestOptions([])
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [coordinateSearch, currentPath, searchQuery, searchType])

  useEffect(() => {
    if (searchType === 'npm' && results.length > 0) {
      void loadPackageSizes()
      void loadPackageDownloads()
      return
    }
    setPackageSizes({})
    setPackageDownloads({})
  }, [results, searchType])

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
    setPackageSizes(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, any]>))
  }

  const loadPackageDownloads = async () => {
    const entries = await Promise.all(
      results.slice(0, 20).map(async (pkg) => {
        if (pkg.downloads) {
          return [pkg.name, pkg.downloads] as const
        }

        try {
          const stats = await window.electronAPI.npm.downloadStats(pkg.name)
          return [pkg.name, stats.downloads || 0] as const
        } catch {
          return null
        }
      })
    )
    setPackageDownloads(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, number]>))
  }

  const runSearch = async (nextQuery = searchQuery) => {
    const query = nextQuery.trim()
    if (!query) {
      message.warning('请输入搜索关键词')
      return
    }

    setSearchQuery(query)
    setLoading(true)
    try {
      const items = await searchPackages(searchType, query, currentPath, coordinateSearch)
      setResults(items)
      setSuggestOptions(toSuggestionOptions(items, searchType))
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '搜索失败',
        description: error.message
      })
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (item: SearchItem, version?: string) => {
    setLoading(true)
    try {
      if (item.type === 'npm') {
        await installPackage({
          packageName: item.name,
          cwd: currentPath,
          version
        })
      } else if (item.type === 'pip') {
        await window.electronAPI.pip.install({
          packageName: item.name,
          cwd: currentPath,
          version
        })
      } else if (item.type === 'maven' || item.type === 'gradle') {
        const targetVersion = version || item.version || item.latestVersion
        if (!targetVersion) {
          throw new Error('未找到可用版本，请先切换版本')
        }
        if (!item.groupId || !item.artifactId) {
          throw new Error('缺少 Maven/Gradle 坐标')
        }
        if (item.type === 'maven') {
          await window.electronAPI.maven.addDependency(currentPath, {
            groupId: item.groupId,
            artifactId: item.artifactId,
            version: targetVersion
          })
        } else {
          await window.electronAPI.gradle.addDependency({
            cwd: currentPath,
            groupId: item.groupId,
            artifactId: item.artifactId,
            version: targetVersion,
            configuration: 'implementation'
          })
        }
      } else if (item.type === 'cargo') {
        await window.electronAPI.cargo.install({
          packageName: item.name,
          cwd: currentPath,
          version
        })
      } else if (item.type === 'native') {
        await window.electronAPI.native.install({
          cwd: currentPath,
          manager: item.manager === 'conan' ? 'conan' : 'vcpkg',
          name: item.name,
          version
        })
      } else {
        await window.electronAPI.go.install({
          modulePath: item.modulePath || item.name,
          cwd: currentPath,
          version
        })
      }

      addNotification({
        type: 'success',
        message: '安装成功',
        description: item.type === 'maven' || item.type === 'gradle'
          ? `${item.groupId}:${item.artifactId}${version ? `@${version}` : ''}`
          : item.type === 'native'
            ? `${item.manager || 'vcpkg'}:${item.name}${version ? `@${version}` : ''}`
            : `${item.modulePath || item.name}${version ? `@${version}` : ''}`
      })

      if (item.type === 'npm') {
        await fetchProjectPackages(currentPath)
      }
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '安装失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const handleShowVersions = async (item: SearchItem) => {
    setSelectedItem(item)
    setVersions([])
    setNpmVersionMetadata(null)
    setStableVersionPage(1)
    setPrereleaseVersionPage(1)
    setVersionLoading(true)
    try {
      if (item.type === 'npm') {
        const metadata = await window.electronAPI.npm.getVersionMetadata(item.name)
        setNpmVersionMetadata(metadata)
        setVersions(metadata.versions.map((version) => version.version))
      } else {
        const versionList = await fetchVersions(item)
        setVersions(versionList)
      }
      setVersionVisible(true)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '获取版本列表失败',
        description: error.message
      })
    } finally {
      setVersionLoading(false)
    }
  }

  const handleInstallVersion = async (version: string) => {
    if (!selectedItem) return
    await handleInstall(selectedItem, version)
    setVersionVisible(false)
  }

  const handleOpenPackagePage = async (item: SearchItem) => {
    const url = resolvePackageUrl(item)
    if (url) {
      await window.electronAPI.openExternal(url)
    }
  }

  const handleViewChangelog = async (item: SearchItem) => {
    if (item.type === 'npm') {
      try {
        const info = await window.electronAPI.npm.getPackageInfo(item.name)
        if (info?.homepage) {
          await window.electronAPI.openExternal(info.homepage)
          return
        }
        if (info?.repository?.url) {
          let url = info.repository.url
          if (url.startsWith('git+')) {
            url = url.replace('git+', '').replace('.git', '')
          }
          if (url.includes('github.com')) {
            await window.electronAPI.openExternal(`${url}/releases`)
            return
          }
          await window.electronAPI.openExternal(url)
          return
        }
      } catch {
      }
      await window.electronAPI.openExternal(`https://www.npmjs.com/package/${item.name}`)
      return
    }

    await handleOpenPackagePage(item)
  }

  const handleShowDetail = async (item: SearchItem) => {
    if (item.type === 'npm') {
      setNpmDetailPackageName(item.name)
      setNpmDetailVisible(true)
      return
    }

    if (item.type === 'pip') {
      setPipDetailVisible(true)
      try {
        const detail = await window.electronAPI.pip.show(item.name, currentPath)
        setPipDetail(detail)
      } catch {
        setPipDetail(null)
      }
      return
    }

    setMavenDetail(item)
    setMavenDetailVisible(true)
  }

  const actionColumn = useMemo(() => ({
    title: '操作',
    key: 'action',
    width: 220,
    render: (_: any, record: SearchItem) => (
      <Space>
        <Button
          size="small"
          type="primary"
          onClick={() => handleInstall(record)}
          disabled={(record.type === 'maven' || record.type === 'gradle') && !record.version && !record.latestVersion}
        >
          {record.type === 'maven' || record.type === 'gradle' ? '添加依赖' : '安装'}
        </Button>
        <Button size="small" icon={<SwapOutlined />} onClick={() => handleShowVersions(record)}>
          版本
        </Button>
        <Dropdown
          menu={{
            items: buildMoreMenuItems(record),
            onClick: ({ key }) => {
              if (key === 'detail') {
                handleShowDetail(record)
              } else if (key === 'page') {
                handleOpenPackagePage(record)
              } else if (key === 'changelog') {
                handleViewChangelog(record)
              }
            }
          }}
        >
          <Button size="small">更多</Button>
        </Dropdown>
      </Space>
    )
  }), [handleInstall, handleOpenPackagePage, handleShowDetail, handleShowVersions, handleViewChangelog])

  const columns = useMemo(() => {
    if (searchType === 'npm') {
      return [
        {
          title: '包名',
          dataIndex: 'name',
          key: 'name',
          width: 220,
          render: (text: string, record: SearchItem) => (
            <Space>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
                <Tag color="blue">{text}</Tag>
              </Button>
            </Space>
          )
        },
        {
          title: '描述',
          dataIndex: 'description',
          key: 'description',
          ellipsis: true,
          render: (text: string, record: SearchItem) => (
            <Space direction="vertical" size={2} className={styles.packageSummary}>
              <span>{cleanPackageSummary(text) || '暂无描述'}</span>
              <Space size={4} wrap>
                {record.keywords?.slice(0, 4).map((keyword) => (
                  <Tag key={keyword} className={styles.keywordTag}>{keyword}</Tag>
                ))}
                {record.date && <span className={styles.metaText}>更新 {formatShortDate(record.date)}</span>}
              </Space>
            </Space>
          )
        },
        {
          title: '版本',
          dataIndex: 'version',
          key: 'version',
          width: 100,
          render: (text: string) => <Tag>v{text}</Tag>
        },
        {
          title: '大小',
          key: 'size',
          width: 100,
          render: (_: any, record: SearchItem) => {
            const size = packageSizes[record.name]
            return size ? (
              <Tooltip title={`${size.fileCount} 个文件`}>
                <Tag icon={<DownloadOutlined />}>{size.prettySize}</Tag>
              </Tooltip>
            ) : '-'
          }
        },
        {
          title: '周下载量',
          dataIndex: 'downloads',
          key: 'downloads',
          width: 110,
          render: (value: number, record: SearchItem) => {
            const downloads = value || packageDownloads[record.name]
            return downloads ? (
            <Tooltip title="npm 最近一周下载量">
              <Tag icon={<CloudDownloadOutlined />}>{formatCompactNumber(downloads)}</Tag>
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
            return typeof author === 'string' ? author : author?.name || '-'
          }
        },
        actionColumn
      ]
    }

    if (searchType === 'pip') {
      return [
        {
          title: '包名',
          dataIndex: 'name',
          key: 'name',
          width: 220,
          render: (text: string, record: SearchItem) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
              <Tag color="cyan">{text}</Tag>
            </Button>
          )
        },
        {
          title: '版本',
          dataIndex: 'version',
          key: 'version',
          width: 110,
          render: (text: string) => text ? <Tag>{text}</Tag> : '-'
        },
        {
          title: '描述',
          dataIndex: 'description',
          key: 'description',
          ellipsis: true,
          render: (text: string) => text || '-'
        },
        actionColumn
      ]
    }

    if (searchType === 'cargo') {
      return [
        {
          title: 'Crate',
          dataIndex: 'name',
          key: 'name',
          width: 220,
          render: (text: string, record: SearchItem) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
              <Tag color="volcano">{text}</Tag>
            </Button>
          )
        },
        {
          title: 'Version',
          dataIndex: 'version',
          key: 'version',
          width: 120,
          render: (text: string) => text ? <Tag>{text}</Tag> : '-'
        },
        {
          title: 'Description',
          dataIndex: 'description',
          key: 'description',
          ellipsis: true,
          render: (text: string) => text || '-'
        },
        actionColumn
      ]
    }

    if (searchType === 'go') {
      return [
        {
          title: 'Module',
          dataIndex: 'modulePath',
          key: 'modulePath',
          width: 320,
          render: (text: string, record: SearchItem) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
              <Tag color="geekblue">{text || record.name}</Tag>
            </Button>
          )
        },
        {
          title: 'Version',
          dataIndex: 'version',
          key: 'version',
          width: 120,
          render: (text: string) => text ? <Tag>{text}</Tag> : '-'
        },
        {
          title: 'Stars',
          dataIndex: 'stars',
          key: 'stars',
          width: 90,
          render: (value: number) => value ? value.toLocaleString() : '-'
        },
        {
          title: 'Description',
          dataIndex: 'description',
          key: 'description',
          ellipsis: true,
          render: (text: string) => text || '-'
        },
        actionColumn
      ]
    }

    if (searchType === 'native') {
      return [
        {
          title: 'Library',
          dataIndex: 'name',
          key: 'name',
          width: 240,
          render: (text: string, record: SearchItem) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
              <Tag color="gold">{text}</Tag>
            </Button>
          )
        },
        {
          title: 'Manager',
          dataIndex: 'manager',
          key: 'manager',
          width: 120,
          render: (text: string) => text ? <Tag>{text}</Tag> : '-'
        },
        {
          title: 'Version',
          dataIndex: 'version',
          key: 'version',
          width: 140,
          render: (text: string) => text || '-'
        },
        {
          title: 'Source',
          dataIndex: 'source',
          key: 'source',
          ellipsis: true,
          render: (text: string, record: SearchItem) => text || record.description || '-'
        },
        actionColumn
      ]
    }

    return [
      {
        title: searchType === 'gradle' ? 'Group' : 'GroupId',
        dataIndex: 'groupId',
        key: 'groupId',
        width: 240,
        render: (text: string, record: SearchItem) => (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleShowDetail(record)}>
            {text}
          </Button>
        )
      },
      {
        title: searchType === 'gradle' ? 'Artifact' : 'ArtifactId',
        dataIndex: 'artifactId',
        key: 'artifactId',
        width: 220
      },
      {
        title: '版本',
        dataIndex: 'version',
        key: 'version',
        width: 120,
        render: (text: string) => text ? <Tag>{text}</Tag> : '-'
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        render: (text: string, record: SearchItem) => (
          <Space size={6} wrap>
            <span>{text || '-'}</span>
            {record.repository && <Tag>{record.repository}</Tag>}
          </Space>
        )
      },
      actionColumn
    ]
  }, [packageDownloads, packageSizes, searchType, actionColumn])

  const pipFallback = selectedPipFallback(results)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>搜索</h2>
        <ProjectPathBar label="当前路径" />
      </div>

      <div className={styles.searchBox}>
        <div className={styles.searchBar}>
          <Select
            className={styles.typeSelect}
            value={searchType}
            onChange={(value) => setSearchType(value)}
            options={SEARCH_TYPE_OPTIONS}
            size="large"
          />
          <AutoComplete
            className={styles.querySuggest}
            value={searchQuery}
            options={suggestOptions}
            onChange={setSearchQuery}
            onSelect={(value) => void runSearch(value)}
          >
            <SearchInput
              placeholder={SEARCH_PLACEHOLDERS[searchType] || 'Search dependencies'}
              onSearch={(value) => void runSearch(value)}
              enterButton={<><SearchOutlined /> 搜索</>}
              size="large"
              loading={loading}
            />
          </AutoComplete>
        </div>
        {renderCoordinateSearchControls()}
      </div>

      <div className={styles.results}>
        <Spin spinning={loading}>
          {results.length === 0 ? (
            <Empty description="输入关键词并选择类型后开始搜索" />
          ) : (
            <Table
              dataSource={results}
              columns={columns}
              rowKey="key"
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: searchType === 'go' ? 1080 : searchType === 'npm' ? 1180 : searchType === 'pip' ? 900 : searchType === 'maven' || searchType === 'gradle' ? 1040 : 960 }}
            />
          )}
        </Spin>
      </div>

      <PackageDetailModal
        visible={npmDetailVisible}
        packageName={npmDetailPackageName}
        onClose={() => setNpmDetailVisible(false)}
        onInstall={(version?: string) => handleInstall({ type: 'npm', key: npmDetailPackageName, name: npmDetailPackageName, raw: null }, version)}
      />

      <Modal
        title={`pip 包详情 - ${selectedPipName(pipDetail, results)}`}
        open={pipDetailVisible}
        onCancel={() => setPipDetailVisible(false)}
        footer={null}
        width={720}
      >
        {pipDetail || pipFallback ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="名称">{pipDetail?.name || pipFallback?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="版本">{pipDetail?.version || pipFallback?.version || '-'}</Descriptions.Item>
            <Descriptions.Item label="摘要">{cleanPackageSummary(pipDetail?.summary || pipFallback?.description) || '-'}</Descriptions.Item>
            <Descriptions.Item label="主页">{pipDetail?.homePage || (pipFallback ? resolvePackageUrl(pipFallback) : '-')}</Descriptions.Item>
            <Descriptions.Item label="作者">{pipDetail?.author || '-'}</Descriptions.Item>
            <Descriptions.Item label="许可证">{pipDetail?.license || '-'}</Descriptions.Item>
            <Descriptions.Item label="位置">{pipDetail?.location || '-'}</Descriptions.Item>
            <Descriptions.Item label="依赖">{pipDetail?.requires || '-'}</Descriptions.Item>
            <Descriptions.Item label="被依赖">{pipDetail?.requiredBy || '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="暂无详情" />
        )}
      </Modal>

      <Modal
        title={`${mavenDetail?.type || 'Dependency'} 详情 - ${detailTitle(mavenDetail)}`}
        open={mavenDetailVisible}
        onCancel={() => setMavenDetailVisible(false)}
        footer={null}
        width={720}
      >
        {mavenDetail ? (
          <Descriptions bordered column={1} size="small">
            {(mavenDetail.type === 'maven' || mavenDetail.type === 'gradle') && (
              <>
                <Descriptions.Item label="GroupId">{mavenDetail.groupId || '-'}</Descriptions.Item>
                <Descriptions.Item label="ArtifactId">{mavenDetail.artifactId || '-'}</Descriptions.Item>
              </>
            )}
            {mavenDetail.type === 'go' && (
              <>
                <Descriptions.Item label="Module">{mavenDetail.modulePath || mavenDetail.name}</Descriptions.Item>
                <Descriptions.Item label="Repository">{mavenDetail.repositoryUrl || '-'}</Descriptions.Item>
                <Descriptions.Item label="Stars">{mavenDetail.stars?.toLocaleString() || '-'}</Descriptions.Item>
              </>
            )}
            {mavenDetail.type === 'cargo' && (
              <Descriptions.Item label="Crate">{mavenDetail.name}</Descriptions.Item>
            )}
            {mavenDetail.type === 'native' && (
              <>
                <Descriptions.Item label="Manager">{mavenDetail.manager || '-'}</Descriptions.Item>
                <Descriptions.Item label="Kind">{mavenDetail.kind || '-'}</Descriptions.Item>
                <Descriptions.Item label="Linkage">{mavenDetail.linkage || '-'}</Descriptions.Item>
                <Descriptions.Item label="Path">{mavenDetail.path || '-'}</Descriptions.Item>
                <Descriptions.Item label="Source">{mavenDetail.source || '-'}</Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="版本">{mavenDetail.version || mavenDetail.latestVersion || '-'}</Descriptions.Item>
            <Descriptions.Item label="最新版本">{mavenDetail.latestVersion || '-'}</Descriptions.Item>
            <Descriptions.Item label="描述">{cleanPackageSummary(mavenDetail.description) || '-'}</Descriptions.Item>
            <Descriptions.Item label="Page">{resolvePackageUrl(mavenDetail) || '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="暂无详情" />
        )}
      </Modal>

      <Modal
        title={`切换版本 - ${detailTitle(selectedItem)}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={680}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="blue">{selectedItem?.version || selectedItem?.latestVersion || '-'}</Tag></span>
          {selectedItem?.type === 'npm' && (
            <div className={styles.versionMeta}>
              <span>{cleanPackageSummary(npmVersionMetadata?.description || selectedItem.description) || '暂无描述'}</span>
              {npmVersionMetadata?.latest && <Tag color="green">latest: {npmVersionMetadata.latest}</Tag>}
            </div>
          )}
          <Spin spinning={versionLoading}>
            <div className={styles.versionList}>
              {selectedItem?.type === 'npm' ? (
                <NpmVersionPicker
                  stable={npmVersionMetadata?.stable || splitVersionStrings(versions).stable}
                  prerelease={npmVersionMetadata?.prerelease || splitVersionStrings(versions).prerelease}
                  currentVersion={selectedItem?.version || selectedItem?.latestVersion}
                  latestVersion={npmVersionMetadata?.latest || selectedItem?.latestVersion || selectedItem?.version}
                  stablePage={stableVersionPage}
                  prereleasePage={prereleaseVersionPage}
                  onStablePageChange={setStableVersionPage}
                  onPrereleasePageChange={setPrereleaseVersionPage}
                  onSelect={handleInstallVersion}
                />
              ) : versions.length === 0 ? (
                <Empty description="未找到版本信息" />
              ) : (
                <div className={styles.versions}>
                  {versions.slice(0, stableVersionPage * 10).map((version) => (
                    <Tag
                      key={version}
                      className={styles.versionTag}
                      color={version === (selectedItem?.version || selectedItem?.latestVersion) ? 'blue' : 'default'}
                      onClick={() => handleInstallVersion(version)}
                    >
                      {version}
                    </Tag>
                  ))}
                  {versions.slice(0, stableVersionPage * 10).length < versions.length && (
                    <Button onClick={() => setStableVersionPage(stableVersionPage + 1)}>
                      加载更多，每次 10 个
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Spin>
        </Space>
      </Modal>
    </div>
  )

  function renderCoordinateSearchControls() {
    if (searchType !== 'maven' && searchType !== 'gradle') return null
    const updateCoordinateSearch = (patch: Partial<CoordinateSearchSettings>) => {
      setCoordinateSearch((current) => ({ ...current, ...patch }))
    }

    return (
      <div className={styles.coordinateSearchPanel}>
        <div className={styles.coordinateControls}>
          <Select
            size="small"
            value={coordinateSearch.scope}
            options={COORDINATE_SEARCH_SCOPES}
            onChange={(scope) => updateCoordinateSearch({ scope })}
          />
          <Select
            size="small"
            value={coordinateSearch.mode}
            options={COORDINATE_SEARCH_MODES}
            onChange={(mode) => updateCoordinateSearch({ mode })}
          />
          <Select
            size="small"
            value={coordinateSearch.source}
            options={COORDINATE_SEARCH_SOURCES}
            onChange={(source) => updateCoordinateSearch({ source })}
          />
          <Checkbox
            checked={coordinateSearch.includeLocal}
            onChange={(event) => updateCoordinateSearch({ includeLocal: event.target.checked })}
          >
            包含本地仓库
          </Checkbox>
        </div>
        {coordinateSearch.source === 'nexus' && (
          <Input
            size="small"
            value={coordinateSearch.customUrl}
            onChange={(event) => updateCoordinateSearch({ customUrl: event.target.value })}
            placeholder="Nexus 3 地址，例如 https://nexus.example.com"
          />
        )}
        <div className={styles.coordinateHelp}>
          默认按 artifactId 前缀匹配：输入 <code>ne</code> 会查询 <code>a:ne*</code>，适合 netty、neethi 这类依赖；也可切到 groupId、坐标、全部字段，或输入 <code>io.netty:netty</code> 做坐标搜索。Maven Central 不接受前导通配符，包含模式会用可索引查询和结果排序兜底；自定义 Nexus 使用 <code>/service/rest/v1/search</code>。
        </div>
      </div>
    )
  }
}

export default SearchPage

async function searchPackages(type: SearchType, query: string, cwd: string, coordinateOptions?: CoordinateSearchSettings): Promise<SearchItem[]> {
  if (type === 'npm') {
    const result = await window.electronAPI.npm.search(query)
    return uniqueByKey(result.map((pkg: any) => ({
      type,
      key: pkg.name,
      name: pkg.name,
      version: pkg.version || '',
      description: cleanPackageSummary(pkg.description),
      author: pkg.author,
      downloads: pkg.downloads,
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      date: pkg.date,
      publisher: pkg.publisher?.username || pkg.publisher?.email || '',
      raw: pkg
    })))
  }

  if (type === 'pip') {
    const result = await window.electronAPI.pip.search(query, cwd)
    return uniqueByKey(result.map((pkg: any) => ({
      type,
      key: pkg.name,
      name: pkg.name,
      version: pkg.version || '',
      description: cleanPackageSummary(pkg.description),
      raw: pkg
    })))
  }

  if (type === 'cargo') {
    const result = await window.electronAPI.cargo.search(query)
    return uniqueByKey(result.map((pkg: any) => ({
      type,
      key: pkg.name,
      name: pkg.name,
      version: pkg.version || '',
      latestVersion: pkg.version || '',
      description: cleanPackageSummary(pkg.description),
      raw: pkg
    })))
  }

  if (type === 'gradle') {
    const result = await window.electronAPI.gradle.search(query, toMavenSearchOptions(coordinateOptions))
    return uniqueByKey(result.map((dep: any) => ({
      type,
      key: `${dep.groupId}:${dep.artifactId}`,
      name: `${dep.groupId}:${dep.artifactId}`,
      groupId: dep.groupId,
      artifactId: dep.artifactId,
      version: dep.version || dep.latestVersion || '',
      latestVersion: dep.latestVersion || dep.version || '',
      description: cleanPackageSummary(dep.description || dep.repository),
      repository: dep.repository,
      raw: dep
    })))
  }

  if (type === 'go') {
    const result = await window.electronAPI.go.search(query, cwd)
    return uniqueByKey(result.map((mod: any) => ({
      type,
      key: mod.path,
      name: mod.path,
      modulePath: mod.path,
      version: mod.version || mod.latest || '',
      latestVersion: mod.latest || mod.version || '',
      description: cleanPackageSummary(mod.description),
      repositoryUrl: mod.repositoryUrl,
      stars: mod.stars,
      raw: mod
    })))
  }

  if (type === 'native') {
    const result = await window.electronAPI.native.search(query)
    return uniqueByKey(result.map((dep: NativeDependencyInfo) => ({
      type,
      key: `${dep.manager}:${dep.name}:${dep.path || ''}`,
      name: dep.name,
      version: dep.version || '',
      latestVersion: dep.version || '',
      description: dep.source || dep.manager,
      manager: dep.manager,
      source: dep.source,
      kind: dep.kind,
      path: dep.path,
      linkage: dep.linkage,
      raw: dep
    })))
  }

  const result = await window.electronAPI.maven.search(query, cwd, toMavenSearchOptions(coordinateOptions))
  return uniqueByKey(result.map((dep: any) => ({
    type,
    key: `${dep.groupId}:${dep.artifactId}`,
    name: `${dep.groupId}:${dep.artifactId}`,
    groupId: dep.groupId,
    artifactId: dep.artifactId,
    version: dep.version || dep.latestVersion || '',
    latestVersion: dep.latestVersion || dep.version || '',
    description: cleanPackageSummary(dep.description || dep.repository),
    repository: dep.repository,
    raw: dep
  })))
}

function toMavenSearchOptions(settings?: CoordinateSearchSettings): MavenSearchOptions | undefined {
  if (!settings) return undefined
  return {
    mode: settings.mode,
    scope: settings.scope,
    source: settings.source,
    customUrl: settings.customUrl,
    includeLocal: settings.includeLocal,
    limit: 30
  }
}

async function fetchVersions(item: SearchItem): Promise<string[]> {
  if (item.type === 'npm') {
    return await window.electronAPI.npm.getVersions(item.name)
  }

  if (item.type === 'pip') {
    return await window.electronAPI.pip.versions(item.name)
  }

  if (item.type === 'cargo') {
    return await window.electronAPI.cargo.versions(item.name)
  }

  if (item.type === 'go') {
    return await window.electronAPI.go.versions(item.modulePath || item.name)
  }

  if (item.type === 'native') {
    return item.version ? [item.version] : []
  }

  if (!item.groupId || !item.artifactId) return []
  if (item.type === 'gradle') {
    return await window.electronAPI.gradle.versions(item.groupId, item.artifactId)
  }
  return await window.electronAPI.maven.versions(item.groupId, item.artifactId)
}

function buildMoreMenuItems(item: SearchItem) {
  const base = [
    { key: 'detail', label: '查看详情', icon: <InfoCircleOutlined /> },
    { key: 'page', label: '打开页面', icon: <GlobalOutlined /> }
  ]

  if (item.type === 'npm') {
    return [
      ...base,
      { key: 'changelog', label: '更新日志', icon: <HistoryOutlined /> }
    ]
  }

  return base
}

function resolvePackageUrl(item: SearchItem): string {
  if (item.type === 'npm') {
    return `https://www.npmjs.com/package/${encodeURIComponent(item.name)}`
  }

  if (item.type === 'pip') {
    return `https://pypi.org/project/${encodeURIComponent(item.name)}/`
  }

  if (item.type === 'cargo') {
    return `https://crates.io/crates/${encodeURIComponent(item.name)}`
  }

  if (item.type === 'go') {
    return item.repositoryUrl || `https://pkg.go.dev/${item.modulePath || item.name}`
  }

  if (item.type === 'native') {
    if (item.manager === 'conan') {
      return `https://conan.io/center/recipes/${encodeURIComponent(item.name)}`
    }
    return `https://vcpkg.io/en/package/${encodeURIComponent(item.name)}`
  }

  if (!item.groupId || !item.artifactId) return ''
  return `https://search.maven.org/artifact/${encodeURIComponent(item.groupId)}/${encodeURIComponent(item.artifactId)}`
}

function selectedPipFallback(results: SearchItem[]): SearchItem | null {
  return results.find((item) => item.type === 'pip') || null
}

function selectedPipName(detail: PipPackageDetail | null, results: SearchItem[]): string {
  return detail?.name || selectedPipFallback(results)?.name || ''
}

function detailTitle(item: SearchItem | null): string {
  if (!item) return ''
  if ((item.type === 'maven' || item.type === 'gradle') && item.groupId && item.artifactId) {
    return `${item.groupId}:${item.artifactId}`
  }
  if (item.type === 'go') return item.modulePath || item.name
  if (item.type === 'native') return `${item.manager || 'native'}:${item.name}`
  return item.name
}

function toSuggestionOptions(items: SearchItem[], type: SearchType): Array<{ value: string; label: React.ReactNode }> {
  return items.slice(0, 8).map((item) => {
    const value = (item.type === 'maven' || item.type === 'gradle') && item.groupId && item.artifactId
      ? `${item.groupId}:${item.artifactId}`
      : item.type === 'go'
        ? item.modulePath || item.name
        : item.name
    const version = item.latestVersion || item.version

    return {
      value,
      label: (
        <div className={styles.suggestionItem}>
          <span className={styles.suggestionName}>{value}</span>
          {version && <Tag className={styles.suggestionVersion}>{version}</Tag>}
          {type === 'npm' && item.downloads ? (
            <Tag className={styles.suggestionVersion} icon={<CloudDownloadOutlined />}>
              {formatCompactNumber(item.downloads)}
            </Tag>
          ) : null}
          {item.description && <span className={styles.suggestionDesc}>{cleanPackageSummary(item.description)}</span>}
          <Tag color={SEARCH_TYPE_COLORS[type] || 'default'}>{type}</Tag>
        </div>
      )
    }
  })
}

function uniqueByKey(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.key || seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}
