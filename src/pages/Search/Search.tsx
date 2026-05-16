import React, { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Button, Descriptions, Dropdown, Empty, Input, Modal, Select, Space, Spin, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, GlobalOutlined, HistoryOutlined, InfoCircleOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore } from '../../stores/packageStore'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import ProjectPathBar from '../../components/ProjectPathBar/ProjectPathBar'
import { localizedMessage as message } from '../../utils/localizedFeedback'
import styles from './Search.module.css'

const { Search: SearchInput } = Input

type SearchType = 'npm' | 'pip' | 'maven'

interface SearchItem {
  type: SearchType
  key: string
  name: string
  version?: string
  description?: string
  author?: string
  groupId?: string
  artifactId?: string
  latestVersion?: string
  raw: any
}

const SEARCH_TYPE_OPTIONS = [
  { label: 'npm', value: 'npm' },
  { label: 'pip', value: 'pip' },
  { label: 'Maven', value: 'maven' }
]

const SEARCH_PLACEHOLDERS: Record<SearchType, string> = {
  npm: '搜索 npm 包，例如 react、typescript',
  pip: '搜索 PyPI 包，例如 requests、httpx',
  maven: '搜索 Maven 依赖，例如 spring-core、junit'
}

const SearchPage: React.FC = () => {
  const [searchType, setSearchType] = useState<SearchType>('npm')
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestOptions, setSuggestOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([])
  const [results, setResults] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [versionVisible, setVersionVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null)
  const [npmDetailVisible, setNpmDetailVisible] = useState(false)
  const [npmDetailPackageName, setNpmDetailPackageName] = useState('')
  const [pipDetailVisible, setPipDetailVisible] = useState(false)
  const [pipDetail, setPipDetail] = useState<PipPackageDetail | null>(null)
  const [mavenDetailVisible, setMavenDetailVisible] = useState(false)
  const [mavenDetail, setMavenDetail] = useState<SearchItem | null>(null)
  const [packageSizes, setPackageSizes] = useState<Record<string, any>>({})

  const currentPath = useAppStore((state) => state.currentPath)
  const addNotification = useAppStore((state) => state.addNotification)
  const installPackage = usePackageStore((state) => state.installPackage)
  const fetchProjectPackages = usePackageStore((state) => state.fetchProjectPackages)

  useEffect(() => {
    setResults([])
    setPackageSizes({})
    setVersions([])
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
        const items = await searchPackages(searchType, query, currentPath)
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
  }, [currentPath, searchQuery, searchType])

  useEffect(() => {
    if (searchType === 'npm' && results.length > 0) {
      void loadPackageSizes()
      return
    }
    setPackageSizes({})
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

  const runSearch = async (nextQuery = searchQuery) => {
    const query = nextQuery.trim()
    if (!query) {
      message.warning('请输入搜索关键词')
      return
    }

    setSearchQuery(query)
    setLoading(true)
    try {
      const items = await searchPackages(searchType, query, currentPath)
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
      } else {
        const targetVersion = version || item.version || item.latestVersion
        if (!targetVersion) {
          throw new Error('未找到可用版本，请先切换版本')
        }
        if (!item.groupId || !item.artifactId) {
          throw new Error('缺少 Maven 坐标')
        }
        await window.electronAPI.maven.addDependency(currentPath, {
          groupId: item.groupId,
          artifactId: item.artifactId,
          version: targetVersion
        })
      }

      addNotification({
        type: 'success',
        message: '安装成功',
        description: item.type === 'maven'
          ? `${item.groupId}:${item.artifactId}${version ? `@${version}` : ''}`
          : `${item.name}${version ? `@${version}` : ''}`
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
    setVersionLoading(true)
    try {
      const versionList = await fetchVersions(item)
      setVersions(versionList)
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
          disabled={record.type === 'maven' && !record.version && !record.latestVersion}
        >
          {record.type === 'maven' ? '添加依赖' : '安装'}
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
          render: (text: string) => text || '-'
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

    return [
      {
        title: 'GroupId',
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
        title: 'ArtifactId',
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
        render: (text: string) => text || '-'
      },
      actionColumn
    ]
  }, [packageSizes, searchType, actionColumn])

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
              placeholder={SEARCH_PLACEHOLDERS[searchType]}
              onSearch={(value) => void runSearch(value)}
              enterButton={<><SearchOutlined /> 搜索</>}
              size="large"
              loading={loading}
            />
          </AutoComplete>
        </div>
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
              scroll={{ x: searchType === 'npm' ? 980 : searchType === 'pip' ? 900 : 960 }}
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
            <Descriptions.Item label="摘要">{pipDetail?.summary || pipFallback?.description || '-'}</Descriptions.Item>
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
        title={`Maven 依赖详情 - ${mavenDetail?.groupId && mavenDetail?.artifactId ? `${mavenDetail.groupId}:${mavenDetail.artifactId}` : ''}`}
        open={mavenDetailVisible}
        onCancel={() => setMavenDetailVisible(false)}
        footer={null}
        width={720}
      >
        {mavenDetail ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="GroupId">{mavenDetail.groupId || '-'}</Descriptions.Item>
            <Descriptions.Item label="ArtifactId">{mavenDetail.artifactId || '-'}</Descriptions.Item>
            <Descriptions.Item label="版本">{mavenDetail.version || mavenDetail.latestVersion || '-'}</Descriptions.Item>
            <Descriptions.Item label="最新版本">{mavenDetail.latestVersion || '-'}</Descriptions.Item>
            <Descriptions.Item label="描述">{mavenDetail.description || '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="暂无详情" />
        )}
      </Modal>

      <Modal
        title={`切换版本 - ${selectedItem?.name || ''}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="blue">{selectedItem?.version || selectedItem?.latestVersion || '-'}</Tag></span>
          <Spin spinning={versionLoading}>
            <div className={styles.versionList}>
              {versions.length === 0 ? (
                <Empty description="未找到版本信息" />
              ) : (
                <div className={styles.versions}>
                  {versions.slice(0, 50).map((version) => (
                    <Tag
                      key={version}
                      className={styles.versionTag}
                      color={version === (selectedItem?.version || selectedItem?.latestVersion) ? 'blue' : 'default'}
                      onClick={() => handleInstallVersion(version)}
                    >
                      {version}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </Spin>
        </Space>
      </Modal>
    </div>
  )
}

export default SearchPage

async function searchPackages(type: SearchType, query: string, cwd: string): Promise<SearchItem[]> {
  if (type === 'npm') {
    const result = await window.electronAPI.npm.search(query)
    return uniqueByKey(result.map((pkg: any) => ({
      type,
      key: pkg.name,
      name: pkg.name,
      version: pkg.version || '',
      description: pkg.description || '',
      author: pkg.author,
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
      description: pkg.description || '',
      raw: pkg
    })))
  }

  const result = await window.electronAPI.maven.search(query, cwd)
  return uniqueByKey(result.map((dep: any) => ({
    type,
    key: `${dep.groupId}:${dep.artifactId}`,
    name: `${dep.groupId}:${dep.artifactId}`,
    groupId: dep.groupId,
    artifactId: dep.artifactId,
    version: dep.version || dep.latestVersion || '',
    latestVersion: dep.latestVersion || dep.version || '',
    description: dep.description || '',
    raw: dep
  })))
}

async function fetchVersions(item: SearchItem): Promise<string[]> {
  if (item.type === 'npm') {
    return await window.electronAPI.npm.getVersions(item.name)
  }

  if (item.type === 'pip') {
    return await window.electronAPI.pip.versions(item.name)
  }

  if (!item.groupId || !item.artifactId) return []
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

  if (!item.groupId || !item.artifactId) return ''
  return `https://search.maven.org/artifact/${encodeURIComponent(item.groupId)}/${encodeURIComponent(item.artifactId)}`
}

function selectedPipFallback(results: SearchItem[]): SearchItem | null {
  return results.find((item) => item.type === 'pip') || null
}

function selectedPipName(detail: PipPackageDetail | null, results: SearchItem[]): string {
  return detail?.name || selectedPipFallback(results)?.name || ''
}

function toSuggestionOptions(items: SearchItem[], type: SearchType): Array<{ value: string; label: React.ReactNode }> {
  return items.slice(0, 8).map((item) => {
    const value = item.type === 'maven' && item.groupId && item.artifactId
      ? `${item.groupId}:${item.artifactId}`
      : item.name
    const version = item.latestVersion || item.version

    return {
      value,
      label: (
        <div className={styles.suggestionItem}>
          <span className={styles.suggestionName}>{value}</span>
          {version && <Tag className={styles.suggestionVersion}>{version}</Tag>}
          {item.description && <span className={styles.suggestionDesc}>{item.description}</span>}
          <Tag color={type === 'npm' ? 'blue' : type === 'pip' ? 'cyan' : 'purple'}>{type}</Tag>
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
