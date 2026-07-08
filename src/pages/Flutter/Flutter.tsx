import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Checkbox, Descriptions, Empty, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tabs, Tag, Tooltip } from 'antd'
import {
  BranchesOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import RuntimeManagerSwitch from '../../components/ManagerSwitch/RuntimeManagerSwitch'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import { DependencyTreeViewer, TreeLikeNode } from '../../components/Package/DependencyTreeViewer'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './Flutter.module.css'

const DEPENDENCY_TYPE_OPTIONS: Array<{ value: FlutterDependencyType; label: string }> = [
  { value: 'dependencies', label: 'dependencies' },
  { value: 'dev_dependencies', label: 'dev_dependencies' },
  { value: 'dependency_overrides', label: 'dependency_overrides' }
]

const SOURCE_OPTIONS: Array<{ value: FlutterDependencySource; label: string }> = [
  { value: 'hosted', label: 'pub.dev / hosted' },
  { value: 'sdk', label: 'Flutter SDK' },
  { value: 'path', label: 'Local path' },
  { value: 'git', label: 'Git' }
]

const FLUTTER_COMMAND_OPTIONS = [
  { value: 'pub get', label: 'flutter pub get' },
  { value: 'pub upgrade', label: 'flutter pub upgrade' },
  { value: 'pub upgrade --major-versions', label: 'flutter pub upgrade --major-versions' },
  { value: 'pub outdated', label: 'flutter pub outdated' },
  { value: 'pub deps', label: 'flutter pub deps' },
  { value: 'analyze', label: 'flutter analyze' },
  { value: 'test', label: 'flutter test' },
  { value: 'build apk', label: 'flutter build apk' },
  { value: 'build web', label: 'flutter build web' }
]

const dependencyTypeColor: Record<FlutterDependencyType, string> = {
  dependencies: 'cyan',
  dev_dependencies: 'geekblue',
  dependency_overrides: 'volcano'
}

const sourceColor: Record<FlutterDependencySource, string> = {
  hosted: 'green',
  sdk: 'blue',
  path: 'purple',
  git: 'gold'
}

const securitySeverityColor: Record<FlutterSecurityIssue['severity'], string> = {
  critical: 'magenta',
  high: 'red',
  medium: 'orange',
  low: 'gold',
  info: 'blue',
  unknown: 'default'
}

function outdatedPackagesByName(result: FlutterOutdatedResult): Record<string, FlutterOutdatedPackage> {
  if (!result.packages) return {}
  if (Array.isArray(result.packages)) {
    return Object.fromEntries(result.packages.map((item) => [item.package || item.name || '', item]).filter(([name]) => name))
  }
  return result.packages
}

function versionFromOutdated(value: FlutterOutdatedVersion | string | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.version || ''
}

function dependencySourceText(record: FlutterDependencyInfo): string {
  if (record.source === 'sdk') return `sdk:${record.sdk || 'flutter'}`
  if (record.source === 'path') return record.path || 'path'
  if (record.source === 'git') return record.git || 'git'
  return 'pub.dev'
}

function toPubspecRelativePath(basePath: string, targetPath: string): string {
  const base = normalizePath(basePath).replace(/\/$/, '')
  const target = normalizePath(targetPath).replace(/\/$/, '')
  const baseRoot = base.match(/^[A-Za-z]:/)?.[0]?.toLowerCase()
  const targetRoot = target.match(/^[A-Za-z]:/)?.[0]?.toLowerCase()

  if (baseRoot && targetRoot && baseRoot !== targetRoot) return target
  if (!base || !target) return target

  const baseParts = stripDrive(base).split('/').filter(Boolean)
  const targetParts = stripDrive(target).split('/').filter(Boolean)
  let common = 0
  while (common < baseParts.length && common < targetParts.length && baseParts[common].toLowerCase() === targetParts[common].toLowerCase()) {
    common += 1
  }

  const up = Array.from({ length: baseParts.length - common }, () => '..')
  const down = targetParts.slice(common)
  const relative = [...up, ...down].join('/')
  return relative || '.'
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function stripDrive(path: string): string {
  return path.replace(/^[A-Za-z]:/, '')
}

const FlutterPage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [projectInfo, setProjectInfo] = useState<FlutterPubspecInfo | null>(null)
  const [dependencies, setDependencies] = useState<FlutterDependencyInfo[]>([])
  const [assets, setAssets] = useState<FlutterAssetInfo[]>([])
  const [outdatedMap, setOutdatedMap] = useState<Record<string, FlutterOutdatedPackage>>({})
  const [loading, setLoading] = useState(false)
  const [dependencyVisible, setDependencyVisible] = useState(false)
  const [assetVisible, setAssetVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [publishVisible, setPublishVisible] = useState(false)
  const [healthVisible, setHealthVisible] = useState(false)
  const [treeVisible, setTreeVisible] = useState(false)
  const [securityVisible, setSecurityVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [dependencyTree, setDependencyTree] = useState<FlutterDependencyTreeNode | null>(null)
  const [securityAudit, setSecurityAudit] = useState<FlutterSecurityAuditResult | null>(null)
  const [selectedDependency, setSelectedDependency] = useState<FlutterDependencyInfo | null>(null)
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; item?: FlutterSearchResult }>>([])
  const [versionOptions, setVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [dependencyForm] = Form.useForm()
  const [assetForm] = Form.useForm()
  const [commandForm] = Form.useForm()
  const [publishForm] = Form.useForm()

  const dependencyRows = useMemo(() => dependencies.map((dependency) => {
    const outdated = outdatedMap[dependency.name]
    const latest = versionFromOutdated(outdated?.latest)
    const resolvable = versionFromOutdated(outdated?.resolvable)
    return {
      ...dependency,
      latest,
      resolvable,
      outdated: Boolean(latest && latest !== dependency.version)
    }
  }), [dependencies, outdatedMap])

  const summaryItems = useMemo(() => {
    const regular = dependencies.filter((item) => item.type === 'dependencies').length
    const dev = dependencies.filter((item) => item.type === 'dev_dependencies').length
    const overrides = dependencies.filter((item) => item.type === 'dependency_overrides').length
    return [
      { label: '清单', value: projectInfo?.hasPubspec ? 'pubspec.yaml' : '未检测到' },
      { label: '依赖', value: String(regular) },
      { label: '开发依赖', value: String(dev) },
      { label: '覆盖', value: String(overrides) },
      { label: '资源', value: String(assets.length) }
    ]
  }, [dependencies, assets.length, projectInfo?.hasPubspec])

  useDependencyHealthReminder('flutter', currentPath, !!currentPath && !!projectInfo?.hasPubspec && dependencies.length > 0)

  useEffect(() => {
    void loadFlutterProject()
  }, [currentPath])

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: '工作目录已切换', description: path })
  }

  const loadFlutterProject = async () => {
    if (!currentPath) {
      setProjectInfo(null)
      setDependencies([])
      setAssets([])
      setOutdatedMap({})
      return
    }

    setLoading(true)
    try {
      const detected = await window.electronAPI.flutter.detect(currentPath)
      if (!detected.hasPubspec) {
        setProjectInfo({
          hasPubspec: false,
          path: detected.path,
          name: '',
          version: '',
          description: '',
          dependencies: [],
          assets: []
        })
        setDependencies([])
        setAssets([])
        setOutdatedMap({})
        return
      }

      const [info, outdated] = await Promise.all([
        window.electronAPI.flutter.read(currentPath),
        window.electronAPI.flutter.outdated(currentPath).catch(() => ({ packages: [] }))
      ])
      setProjectInfo(info)
      setDependencies(info.dependencies)
      setAssets(info.assets)
      setOutdatedMap(outdatedPackagesByName(outdated))
    } catch (error: any) {
      setDependencies([])
      setAssets([])
      addNotification({ type: 'error', message: '加载 Flutter 项目失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openPubspec = async () => {
    if (!projectInfo?.hasPubspec) return
    try {
      await window.electronAPI.system.openFile(projectInfo.path)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 pubspec.yaml 失败', description: error.message })
    }
  }

  const openDependencyModal = () => {
    dependencyForm.resetFields()
    dependencyForm.setFieldsValue({ type: 'dependencies', source: 'hosted' })
    setSearchOptions([])
    setVersionOptions([])
    setDependencyVisible(true)
  }

  const searchPackages = async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchOptions([])
      return
    }

    try {
      const result = await window.electronAPI.flutter.search(normalized)
      setSearchOptions(result.map((item) => ({
        value: item.name,
        label: `${item.name}${item.version ? ` (${item.version})` : ''}${item.description ? ` - ${item.description}` : ''}`,
        item
      })))
    } catch {
      setSearchOptions([])
    }
  }

  const selectPackage = (_: string, option: any) => {
    const item = option.item as FlutterSearchResult | undefined
    if (!item) return
    dependencyForm.setFieldsValue({
      packageName: item.name,
      version: item.version
    })
    setVersionOptions(item.version ? [{ value: item.version, label: item.version }] : [])
  }

  const loadInstallVersions = async () => {
    const packageName = dependencyForm.getFieldValue('packageName')
    if (!packageName) return

    try {
      const versions = await window.electronAPI.flutter.versions(packageName)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length === 0) {
        addNotification({ type: 'info', message: '未找到版本信息', description: packageName })
      }
    } catch (error: any) {
      setVersionOptions([])
      addNotification({ type: 'error', message: '加载 pub.dev 版本失败', description: error.message })
    }
  }

  const chooseLocalDependencyPath = async () => {
    const directory = await window.electronAPI.selectDirectory()
    if (!directory) return
    dependencyForm.setFieldsValue({
      path: currentPath ? toPubspecRelativePath(currentPath, directory) : normalizePath(directory)
    })
  }

  const addDependency = async (values: FlutterDependencyArgs) => {
    if (!currentPath) {
      addNotification({ type: 'warning', message: '请先选择 Flutter 项目目录' })
      return
    }

    setLoading(true)
    try {
      await window.electronAPI.flutter.addDependency({
        ...values,
        cwd: currentPath
      })
      setDependencyVisible(false)
      dependencyForm.resetFields()
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 依赖已保存', description: values.packageName })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 Flutter 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateDependency = async (record: FlutterDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.flutter.updateDependency({
        cwd: currentPath,
        packageName: record.name,
        type: record.type
      })
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 依赖已更新', description: record.name })
    } catch (error: any) {
      addNotification({ type: 'error', message: '更新 Flutter 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateAllDependencies = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.updateDependency({ cwd: currentPath })
      await loadFlutterProject()
      setOutputTitle('flutter pub upgrade --major-versions')
      setOutput(result || 'Completed')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Flutter 依赖批量升级完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Flutter 批量升级失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeDependency = async (record: FlutterDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.flutter.removeDependency({
        cwd: currentPath,
        packageName: record.name,
        type: record.type
      })
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 依赖已移除', description: record.name })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Flutter 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyVersions = async (record: FlutterDependencyInfo) => {
    setSelectedDependency(record)
    setVersionOptions([])
    setVersionVisible(true)
    setLoading(true)
    try {
      const versions = await window.electronAPI.flutter.versions(record.name)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
    } catch (error: any) {
      addNotification({ type: 'error', message: '加载 Flutter 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const installSelectedVersion = async (version: string) => {
    if (!currentPath || !selectedDependency) return
    setLoading(true)
    try {
      await window.electronAPI.flutter.addDependency({
        cwd: currentPath,
        packageName: selectedDependency.name,
        version,
        type: selectedDependency.type,
        source: selectedDependency.source || 'hosted',
        sdk: selectedDependency.sdk,
        path: selectedDependency.path,
        git: selectedDependency.git
      })
      setVersionVisible(false)
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 版本已切换', description: `${selectedDependency.name}@${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: '切换 Flutter 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runPubGet = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.get(currentPath)
      setOutputTitle('flutter pub get')
      setOutput(result || 'Completed')
      setOutputVisible(true)
      await loadFlutterProject()
    } catch (error: any) {
      addNotification({ type: 'error', message: 'flutter pub get 失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyGraph = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.dependencyTree(currentPath)
      setDependencyTree(result)
      setTreeVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 Flutter 依赖图失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const modifyTreeNode = (node: TreeLikeNode) => {
    const directDependency = dependencies.find((item) => item.name === node.name)
    if (directDependency) {
      void showDependencyVersions(directDependency)
      return
    }

    dependencyForm.resetFields()
    dependencyForm.setFieldsValue({
      packageName: node.name,
      version: node.version,
      type: 'dependency_overrides',
      source: 'hosted'
    })
    setSearchOptions([])
    setVersionOptions(node.version ? [{ value: node.version, label: node.version }] : [])
    setDependencyVisible(true)
  }

  const showOutdated = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.outdated(currentPath)
      setOutdatedMap(outdatedPackagesByName(result))
      setOutputTitle('flutter pub outdated')
      setOutput(JSON.stringify(result, null, 2))
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '检查 Flutter 过期依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runSecurityAudit = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.securityAudit(currentPath)
      setSecurityAudit(result)
      setSecurityVisible(true)
      addNotification({
        type: result.issues.length > 0 ? 'warning' : 'success',
        message: result.issues.length > 0 ? '发现 Flutter 安全风险' : '未发现公开披露安全风险',
        description: result.issues.length > 0 ? `${result.vulnerableCount} 个依赖受影响` : `已检查 ${result.dependencyCount} 个依赖`
      })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Flutter 安全审计失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    commandForm.setFieldsValue({ command: 'pub get' })
    setCommandVisible(true)
  }

  const runCommand = async (values: { command: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.run(currentPath, values.command)
      setOutputTitle(`flutter ${values.command}`)
      setOutput(result || 'Completed')
      setOutputVisible(true)
      setCommandVisible(false)
      await loadFlutterProject()
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Flutter 命令执行失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openPackagePage = async (packageName: string) => {
    try {
      await window.electronAPI.openExternal(`https://pub.dev/packages/${encodeURIComponent(packageName)}`)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 pub.dev 失败', description: error.message })
    }
  }

  const openAssetModal = () => {
    assetForm.resetFields()
    setAssetVisible(true)
  }

  const addAsset = async (values: { path: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.flutter.addAsset({ cwd: currentPath, path: values.path })
      setAssetVisible(false)
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 资源已添加', description: values.path })
    } catch (error: any) {
      addNotification({ type: 'error', message: '添加 Flutter 资源失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeAsset = async (record: FlutterAssetInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.flutter.removeAsset({ cwd: currentPath, path: record.path })
      await loadFlutterProject()
      addNotification({ type: 'success', message: 'Flutter 资源已移除', description: record.path })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Flutter 资源失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const checkPublish = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.checkPublish(currentPath)
      setOutputTitle('pub.dev 发布检查')
      setOutput(JSON.stringify(result, null, 2))
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '发布检查失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openPublishModal = () => {
    publishForm.resetFields()
    publishForm.setFieldsValue({ dryRun: true, force: false })
    setPublishVisible(true)
  }

  const publishPackage = async (values: FlutterPublishArgs) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.flutter.publish({
        cwd: currentPath,
        dryRun: values.dryRun !== false,
        force: values.force,
        server: values.server
      })
      setPublishVisible(false)
      setOutputTitle(values.dryRun === false ? 'flutter pub publish' : 'flutter pub publish --dry-run')
      setOutput(result || 'Completed')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Flutter 发布命令完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Flutter 发布失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const dependencyColumns = useMemo<any[]>(() => [
    {
      title: 'Package',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (text: string, record: FlutterDependencyInfo & { outdated?: boolean }) => (
        <Space size={6} wrap>
          <Tag color={record.outdated ? 'orange' : 'cyan'}>{text}</Tag>
          {record.source && record.source !== 'hosted' && <Tag color={sourceColor[record.source]}>{record.source}</Tag>}
        </Space>
      )
    },
    {
      title: '版本约束',
      dataIndex: 'version',
      key: 'version',
      width: 160,
      render: (text: string) => text || <Tag>source</Tag>
    },
    {
      title: 'Latest',
      dataIndex: 'latest',
      key: 'latest',
      width: 140,
      render: (text: string) => text || '-'
    },
    {
      title: '分组',
      dataIndex: 'type',
      key: 'type',
      width: 180,
      render: (text: FlutterDependencyType) => <Tag color={dependencyTypeColor[text]}>{text}</Tag>
    },
    {
      title: '来源',
      key: 'source',
      ellipsis: true,
      render: (_: unknown, record: FlutterDependencyInfo) => dependencySourceText(record)
    },
    {
      title: '操作',
      key: 'actions',
      width: 340,
      render: (_: unknown, record: FlutterDependencyInfo) => (
        <Space wrap size={6}>
          <Button size="small" onClick={() => showDependencyVersions(record)}>版本</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={() => updateDependency(record)}>更新</Button>
          <Tooltip title="打开 pub.dev">
            <Button size="small" icon={<ExportOutlined />} onClick={() => openPackagePage(record.name)} />
          </Tooltip>
          <Popconfirm
            title="确认移除此 Flutter 依赖？"
            okText="移除"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeDependency(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ], [currentPath, outdatedMap])

  const assetColumns = useMemo<any[]>(() => [
    {
      title: '资源路径',
      dataIndex: 'path',
      key: 'path',
      render: (text: string, record: FlutterAssetInfo) => (
        <Space>
          <Tag color={record.kind === 'directory' ? 'blue' : 'green'}>{record.kind}</Tag>
          <span>{text}</span>
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: FlutterAssetInfo) => (
        <Popconfirm
          title="确认移除此资源声明？"
          okText="移除"
          okButtonProps={{ danger: true }}
          onConfirm={() => removeAsset(record)}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
        </Popconfirm>
      )
    }
  ], [currentPath])

  const securityColumns = useMemo<any[]>(() => [
    {
      title: '依赖',
      dataIndex: 'packageName',
      key: 'packageName',
      width: 180,
      render: (text: string, record: FlutterSecurityIssue) => (
        <Space size={6} wrap>
          <Tag color="red">{text}</Tag>
          <Tag>{record.version}</Tag>
        </Space>
      )
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 120,
      render: (severity: FlutterSecurityIssue['severity']) => (
        <Tag color={securitySeverityColor[severity]}>{severity.toUpperCase()}</Tag>
      )
    },
    {
      title: '公告',
      dataIndex: 'id',
      key: 'id',
      width: 150,
      render: (text: string, record: FlutterSecurityIssue) => (
        <Button type="link" size="small" onClick={() => window.electronAPI.openExternal(record.url)}>
          {text}
        </Button>
      )
    },
    {
      title: '影响与修复',
      key: 'summary',
      render: (_: unknown, record: FlutterSecurityIssue) => (
        <Space orientation="vertical" size={2} style={{ width: '100%' }}>
          <strong>{record.summary}</strong>
          <span>{record.affectedRange || '影响范围以公告为准'}</span>
          <span>{record.fixedVersion ? `建议升级到 ${record.fixedVersion} 或更高版本` : '暂未在公告中找到明确修复版本'}</span>
          {record.aliases.length > 0 && <span>{record.aliases.join(', ')}</span>}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_: unknown, record: FlutterSecurityIssue) => (
        <Space wrap>
          <Button size="small" onClick={() => openPackagePage(record.packageName)}>pub.dev</Button>
          <Button size="small" type="primary" onClick={() => {
            const dep = dependencies.find((item) => item.name === record.packageName)
            if (dep) {
              void showDependencyVersions(dep)
            }
          }}>
            升级
          </Button>
        </Space>
      )
    }
  ], [dependencies])

  const renderSourceFields = () => (
    <Form.Item shouldUpdate noStyle>
      {({ getFieldValue }) => {
        const source = getFieldValue('source') as FlutterDependencySource
        if (source === 'sdk') {
          return (
            <Form.Item name="sdk" label="SDK">
              <Input placeholder="flutter" />
            </Form.Item>
          )
        }
        if (source === 'path') {
          return (
            <Form.Item name="path" label="Path" rules={[{ required: true, message: '请输入本地依赖路径' }]}>
              <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="../local_package" />
                <Button icon={<FolderOpenOutlined />} onClick={chooseLocalDependencyPath}>选择</Button>
              </Space.Compact>
            </Form.Item>
          )
        }
        if (source === 'git') {
          return (
            <Form.Item name="git" label="Git URL" rules={[{ required: true, message: '请输入 Git URL' }]}>
              <Input placeholder="https://github.com/org/package.git" />
            </Form.Item>
          )
        }
        return null
      }}
    </Form.Item>
  )

  const hasPubspec = !!projectInfo?.hasPubspec
  const actionsDisabled = !currentPath || !hasPubspec

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>Flutter pub 管理</h2>
            <div className={styles.subtitle}>管理 pubspec.yaml 依赖、assets 资源声明、pub get/outdated/deps 以及 pub.dev 发布。</div>
          </div>
          <RuntimeManagerSwitch active="flutter" />
        </div>
        <Space className={styles.actions} wrap>
          <span className={styles.pathValue}>{currentPath || '未选择目录'}</span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>选择目录</Button>
        </Space>
      </div>

      <div className={styles.summaryGrid}>
        {summaryItems.map((item) => (
          <div key={item.label} className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      {!currentPath && (
        <Alert type="info" showIcon title="选择 Flutter 项目目录以加载 pubspec.yaml。" />
      )}
      {currentPath && projectInfo && !projectInfo.hasPubspec && (
        <Alert
          type="warning"
          showIcon
          title="所选目录未检测到 pubspec.yaml。"
          description="添加或更新 Flutter/Dart 依赖前，请选择 Flutter 项目根目录。"
        />
      )}

      <div className={styles.workspace}>
        <Tabs
          items={[
            {
              key: 'dependencies',
              label: '依赖',
              children: (
                <>
                  <div className={styles.sectionHeader}>
                    <Space>
                      <CodeOutlined />
                      <strong>pubspec.yaml 依赖</strong>
                    </Space>
                    <Space wrap>
                      <Button icon={<ReloadOutlined />} onClick={loadFlutterProject} loading={loading} disabled={!currentPath}>刷新</Button>
                      <Button icon={<FileTextOutlined />} onClick={openPubspec} disabled={!hasPubspec}>打开 pubspec.yaml</Button>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openDependencyModal} disabled={actionsDisabled}>添加依赖</Button>
                      <Button icon={<SyncOutlined />} onClick={updateAllDependencies} loading={loading} disabled={actionsDisabled || dependencies.length === 0}>更新全部</Button>
                      <Button icon={<PlayCircleOutlined />} onClick={runPubGet} loading={loading} disabled={actionsDisabled}>pub get</Button>
                      <Button icon={<BranchesOutlined />} onClick={showDependencyGraph} loading={loading} disabled={actionsDisabled}>依赖图</Button>
                      <Button icon={<WarningOutlined />} onClick={runSecurityAudit} loading={loading} disabled={actionsDisabled}>安全审计</Button>
                      <Button icon={<WarningOutlined />} onClick={() => setHealthVisible(true)} disabled={actionsDisabled}>依赖诊断</Button>
                    </Space>
                  </div>

                  {hasPubspec && (
                    <Descriptions bordered size="small" column={1} className={styles.manifestInfo}>
                      <Descriptions.Item label="清单">{projectInfo?.path}</Descriptions.Item>
                      <Descriptions.Item label="包名">{projectInfo?.name || '-'}</Descriptions.Item>
                      <Descriptions.Item label="版本">{projectInfo?.version || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Dart SDK">{projectInfo?.environmentSdk || '-'}</Descriptions.Item>
                    </Descriptions>
                  )}

                  <Spin spinning={loading}>
                    {dependencies.length === 0 ? (
                      <Empty description={hasPubspec ? '暂无 Flutter 依赖' : '未加载 Flutter 项目'} />
                    ) : (
                      <Table
                        dataSource={dependencyRows}
                        columns={dependencyColumns}
                        rowKey={(record) => `${record.type}:${record.name}`}
                        size="small"
                        pagination={{ pageSize: 20 }}
                        scroll={{ x: 1200 }}
                      />
                    )}
                  </Spin>
                </>
              )
            },
            {
              key: 'assets',
              label: '资源与发布',
              children: (
                <>
                  <div className={styles.sectionHeader}>
                    <Space>
                      <FileTextOutlined />
                      <strong>Flutter assets / 发布</strong>
                    </Space>
                    <Space wrap>
                      <Button icon={<PlusOutlined />} onClick={openAssetModal} disabled={actionsDisabled}>添加资源</Button>
                      <Button icon={<WarningOutlined />} onClick={showOutdated} loading={loading} disabled={actionsDisabled}>Outdated</Button>
                      <Button icon={<PlayCircleOutlined />} onClick={openCommandModal} disabled={actionsDisabled}>运行命令</Button>
                      <Button icon={<CloudUploadOutlined />} onClick={checkPublish} loading={loading} disabled={actionsDisabled}>发布检查</Button>
                      <Button type="primary" icon={<CloudUploadOutlined />} onClick={openPublishModal} disabled={actionsDisabled}>发布</Button>
                    </Space>
                  </div>

                  <Spin spinning={loading}>
                    {assets.length === 0 ? (
                      <Empty description={hasPubspec ? '暂无 assets 资源声明' : '未加载 Flutter 项目'} />
                    ) : (
                      <Table
                        dataSource={assets}
                        columns={assetColumns}
                        rowKey="path"
                        size="small"
                        pagination={false}
                      />
                    )}
                  </Spin>
                </>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="添加 Flutter 依赖"
        open={dependencyVisible}
        onCancel={() => setDependencyVisible(false)}
        onOk={() => dependencyForm.submit()}
        okText="保存"
        forceRender
      >
        <Form form={dependencyForm} layout="vertical" onFinish={addDependency}>
          <Form.Item name="packageName" label="Package" rules={[{ required: true, message: '请输入包名' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchPackages}
              onSelect={selectPackage}
              placeholder="provider"
            />
          </Form.Item>
          <Form.Item name="source" label="来源">
            <Select options={SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item label="版本">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete options={versionOptions} placeholder="留空使用 pub.dev 最新版本" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadInstallVersions}>版本</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="type" label="分组">
            <Select options={DEPENDENCY_TYPE_OPTIONS} />
          </Form.Item>
          {renderSourceFields()}
        </Form>
      </Modal>

      <Modal
        title="添加 Flutter 资源"
        open={assetVisible}
        onCancel={() => setAssetVisible(false)}
        onOk={() => assetForm.submit()}
        okText="添加"
        forceRender
      >
        <Form form={assetForm} layout="vertical" onFinish={addAsset}>
          <Form.Item name="path" label="Asset path" rules={[{ required: true, message: '请输入资源路径' }]}>
            <AutoComplete
              options={[
                { value: 'assets/' },
                { value: 'assets/images/' },
                { value: 'assets/icons/' },
                { value: 'assets/config/app.json' }
              ]}
              placeholder="assets/images/"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="运行 Flutter 命令"
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="运行"
        forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="command" label="flutter 参数" rules={[{ required: true, message: '请输入 flutter 命令参数' }]}>
            <AutoComplete options={FLUTTER_COMMAND_OPTIONS} placeholder="pub get" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`版本 - ${selectedDependency?.name || ''}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={620}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本约束: <Tag color="cyan">{selectedDependency?.version || '-'}</Tag></span>
          <div className={styles.versions}>
            {versionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              versionOptions.map((item) => (
                <Tag
                  key={item.value}
                  color={item.value === selectedDependency?.version ? 'cyan' : 'default'}
                  className={styles.versionTag}
                  onClick={() => installSelectedVersion(item.value)}
                >
                  {item.value}
                </Tag>
              ))
            )}
          </div>
        </Space>
      </Modal>

      <Modal
        title="发布到 pub.dev"
        open={publishVisible}
        onCancel={() => setPublishVisible(false)}
        onOk={() => publishForm.submit()}
        okText="执行"
        forceRender
      >
        <Form form={publishForm} layout="vertical" onFinish={publishPackage} initialValues={{ dryRun: true, force: false }}>
          <Form.Item name="dryRun" valuePropName="checked">
            <Checkbox>Dry run，仅执行发布预检</Checkbox>
          </Form.Item>
          <Form.Item name="force" valuePropName="checked">
            <Checkbox>Force，跳过交互确认</Checkbox>
          </Form.Item>
          <Form.Item name="server" label="Server">
            <Input placeholder="留空使用 pub.dev；可填自定义 pub server" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={outputTitle}
        open={outputVisible}
        onCancel={() => setOutputVisible(false)}
        footer={null}
        width={900}
      >
        <pre className={styles.output}>{output}</pre>
      </Modal>

      <DependencyTreeViewer
        title="Flutter 依赖树"
        visible={treeVisible}
        data={dependencyTree}
        actionLabel="修改"
        canNodeAction={(node) => node.name !== projectInfo?.name}
        onNodeAction={modifyTreeNode}
        onClose={() => setTreeVisible(false)}
      />

      <Modal
        title="Flutter 安全审计"
        open={securityVisible}
        onCancel={() => setSecurityVisible(false)}
        footer={null}
        width={1100}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type={securityAudit?.issues.length ? 'warning' : 'success'}
            showIcon
            title={securityAudit?.issues.length ? `发现 ${securityAudit.issues.length} 条公开披露风险` : '未发现公开披露安全风险'}
            description={[
              securityAudit ? `数据源: ${securityAudit.source}` : '',
              securityAudit ? `检查依赖: ${securityAudit.dependencyCount}` : '',
              securityAudit?.skipped.length ? `跳过未锁定版本: ${securityAudit.skipped.join(', ')}` : '',
              securityAudit?.error || ''
            ].filter(Boolean).join('；')}
            action={<Button onClick={runSecurityAudit} loading={loading}>重新审计</Button>}
          />
          {!securityAudit || securityAudit.issues.length === 0 ? (
            <Empty description="暂无安全风险结果" />
          ) : (
            <Table
              dataSource={securityAudit.issues}
              columns={securityColumns}
              rowKey={(record) => `${record.packageName}:${record.version}:${record.id}`}
              size="small"
              pagination={{ pageSize: 8 }}
              scroll={{ x: 980 }}
            />
          )}
        </Space>
      </Modal>

      <DependencyHealthModal
        visible={healthVisible}
        manager="flutter"
        cwd={currentPath}
        onClose={() => setHealthVisible(false)}
      />
    </div>
  )
}

export default FlutterPage
