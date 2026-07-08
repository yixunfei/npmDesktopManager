import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Empty, Form, Input, Modal, Segmented, Select, Space, Spin, Switch, Table, Tag, Tooltip } from 'antd'
import {
  ApartmentOutlined,
  BranchesOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SecurityScanOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/appStore'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './PluginComponents.module.css'

type RuntimeManager = Extract<PackageManagerId, 'cargo' | 'gradle' | 'go' | 'native'>

const runtimeManagers: RuntimeManager[] = ['cargo', 'gradle', 'go', 'native']
const existingRoutes: Partial<Record<PackageManagerId, string>> = {
  npm: '/npm',
  pip: '/pip',
  maven: '/maven',
  cargo: '/cargo',
  gradle: '/gradle',
  go: '/go',
  flutter: '/flutter',
  native: '/native'
}

const managerColors: Record<PackageManagerId, string> = {
  npm: 'blue',
  pip: 'cyan',
  maven: 'purple',
  cargo: 'volcano',
  gradle: 'green',
  go: 'geekblue',
  flutter: 'cyan',
  native: 'gold'
}

const commandOptions: Record<RuntimeManager, Array<{ value: string; label: string }>> = {
  cargo: [
    { value: 'check', label: 'cargo check' },
    { value: 'test', label: 'cargo test' },
    { value: 'build', label: 'cargo build' },
    { value: 'run', label: 'cargo run' },
    { value: 'tree', label: 'cargo tree' }
  ],
  gradle: [
    { value: 'tasks --all', label: 'gradle tasks --all' },
    { value: 'build', label: 'gradle build' },
    { value: 'test', label: 'gradle test' },
    { value: 'dependencies', label: 'gradle dependencies' }
  ],
  go: [
    { value: 'test ./...', label: 'go test ./...' },
    { value: 'build ./...', label: 'go build ./...' },
    { value: 'mod tidy', label: 'go mod tidy' },
    { value: 'mod graph', label: 'go mod graph' }
  ],
  native: [
    { value: 'cmake -S . -B build', label: 'cmake -S . -B build' },
    { value: 'cmake --build build', label: 'cmake --build build' },
    { value: 'vcpkg install', label: 'vcpkg install' },
    { value: 'conan install . --output-folder=build --build=missing', label: 'conan install' }
  ]
}

const defaultCommands: Record<RuntimeManager, string> = {
  cargo: 'check',
  gradle: 'tasks --all',
  go: 'test ./...',
  native: 'cmake -S . -B build'
}

function isRuntimeManager(manager: PackageManagerId): manager is RuntimeManager {
  return runtimeManagers.includes(manager as RuntimeManager)
}

const PluginComponentsPage: React.FC = () => {
  const navigate = useNavigate()
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [plugins, setPlugins] = useState<PackageManagerPlugin[]>([])
  const [activeManager, setActiveManager] = useState<PackageManagerId>('cargo')
  const [dependencies, setDependencies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [healthVisible, setHealthVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [installSearchOptions, setInstallSearchOptions] = useState<Array<{ value: string; label: string; item?: any }>>([])
  const [installVersionOptions, setInstallVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [installForm] = Form.useForm()
  const [commandForm] = Form.useForm()

  const activePlugin = useMemo(
    () => plugins.find((plugin) => plugin.id === activeManager) || null,
    [activeManager, plugins]
  )

  const segmentedOptions = useMemo(() => plugins.map((plugin) => ({
    label: plugin.packageManager,
    value: plugin.id,
    disabled: !plugin.enabled
  })), [plugins])

  useDependencyHealthReminder(
    activeManager as DependencyHealthManager,
    currentPath,
    isRuntimeManager(activeManager) && !!currentPath && dependencies.length > 0
  )

  useEffect(() => {
    loadCatalog()
  }, [currentPath])

  useEffect(() => {
    setInstallSearchOptions([])
    setInstallVersionOptions([])
    installForm.resetFields()
  }, [activeManager])

  useEffect(() => {
    if (!isRuntimeManager(activeManager)) {
      setDependencies([])
      return
    }
    if (activePlugin?.enabled && currentPath) {
      void loadDependencies(activeManager)
    } else {
      setDependencies([])
    }
  }, [activeManager, activePlugin?.enabled, currentPath])

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: 'Working directory changed', description: path })
  }

  const loadCatalog = async () => {
    setCatalogLoading(true)
    try {
      const result = await window.electronAPI.plugins.catalog(currentPath || undefined)
      setPlugins(result)
      const preferred = result.find((item) => item.detected && isRuntimeManager(item.id))
        || result.find((item) => item.enabled && isRuntimeManager(item.id))
        || result.find((item) => isRuntimeManager(item.id))
      if (preferred) {
        setActiveManager((current) => result.some((item) => item.id === current) ? current : preferred.id)
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Plugin catalog failed', description: error.message })
    } finally {
      setCatalogLoading(false)
    }
  }

  const loadDependencies = async (manager = activeManager) => {
    if (!currentPath || !isRuntimeManager(manager)) return
    setLoading(true)
    try {
      if (manager === 'cargo') {
        setDependencies(await window.electronAPI.cargo.list(currentPath))
      } else if (manager === 'gradle') {
        setDependencies(await window.electronAPI.gradle.list(currentPath))
      } else if (manager === 'go') {
        setDependencies(await window.electronAPI.go.list(currentPath))
      } else {
        setDependencies(await window.electronAPI.native.list(currentPath))
      }
    } catch (error: any) {
      setDependencies([])
      addNotification({ type: 'error', message: `${manager} dependencies failed`, description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const setPluginEnabled = async (id: PackageManagerId, enabled: boolean) => {
    setCatalogLoading(true)
    try {
      const result = await window.electronAPI.plugins.setEnabled(id, enabled, currentPath || undefined)
      setPlugins(result)
      addNotification({
        type: 'success',
        message: enabled ? 'Component enabled' : 'Component disabled',
        description: id
      })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Component update failed', description: error.message })
    } finally {
      setCatalogLoading(false)
    }
  }

  const openInstallModal = () => {
    installForm.resetFields()
    setInstallSearchOptions([])
    setInstallVersionOptions([])
    if (activeManager === 'cargo') {
      installForm.setFieldsValue({ type: 'dependencies' })
    }
    if (activeManager === 'gradle') {
      installForm.setFieldsValue({ configuration: 'implementation' })
    }
    if (activeManager === 'native') {
      installForm.setFieldsValue({ manager: 'vcpkg' })
    }
    setInstallVisible(true)
  }

  const searchInstallCandidates = async (query: string) => {
    const normalized = query.trim()
    if (!normalized || !isRuntimeManager(activeManager)) {
      setInstallSearchOptions([])
      return
    }

    try {
      if (activeManager === 'cargo') {
        const result = await window.electronAPI.cargo.search(normalized)
        setInstallSearchOptions(result.map((item) => ({
          value: item.name,
          label: `${item.name}${item.version ? ` (${item.version})` : ''}${item.description ? ` - ${item.description}` : ''}`,
          item
        })))
      } else if (activeManager === 'gradle') {
        const result = await window.electronAPI.gradle.search(normalized, {
          mode: 'startsWith',
          scope: 'artifactId',
          source: 'mavenCentral'
        })
        setInstallSearchOptions(result.map((item) => ({
          value: `${item.groupId}:${item.artifactId}`,
          label: `${item.groupId}:${item.artifactId}${item.latestVersion ? ` (${item.latestVersion})` : ''}`,
          item
        })))
      } else if (activeManager === 'go') {
        const result = await window.electronAPI.go.search(normalized, currentPath)
        setInstallSearchOptions(result.map((item) => ({
          value: item.path,
          label: `${item.path}${item.version ? ` (${item.version})` : ''}${item.description ? ` - ${item.description}` : ''}`,
          item
        })))
      } else {
        const result = await window.electronAPI.native.search(normalized)
        setInstallSearchOptions(result.map((item) => ({
          value: item.name,
          label: `${item.name}${item.version ? ` (${item.version})` : ''} - ${item.manager}`,
          item
        })))
      }
    } catch {
      setInstallSearchOptions([])
    }
  }

  const selectInstallCandidate = (_: string, option: any) => {
    const item = option.item
    if (!item) return

    if (activeManager === 'cargo') {
      installForm.setFieldsValue({
        packageName: item.name,
        version: item.version
      })
      setInstallVersionOptions(item.version ? [{ value: item.version, label: item.version }] : [])
    } else if (activeManager === 'gradle') {
      installForm.setFieldsValue({
        groupId: item.groupId,
        artifactId: item.artifactId,
        version: item.latestVersion || item.version,
        configuration: 'implementation'
      })
      setInstallVersionOptions((item.latestVersion || item.version) ? [{ value: item.latestVersion || item.version, label: item.latestVersion || item.version }] : [])
    } else if (activeManager === 'go') {
      installForm.setFieldsValue({
        modulePath: item.path,
        version: item.version || item.latest
      })
      setInstallVersionOptions((item.version || item.latest) ? [{ value: item.version || item.latest, label: item.version || item.latest }] : [])
    } else if (activeManager === 'native') {
      installForm.setFieldsValue({
        manager: item.manager === 'conan' ? 'conan' : 'vcpkg',
        name: item.name,
        version: item.version
      })
      setInstallVersionOptions(item.version ? [{ value: item.version, label: item.version }] : [])
    }
  }

  const loadInstallVersions = async () => {
    if (!isRuntimeManager(activeManager)) return

    try {
      const values = installForm.getFieldsValue()
      let versions: string[] = []
      if (activeManager === 'cargo' && values.packageName) {
        versions = await window.electronAPI.cargo.versions(values.packageName)
      } else if (activeManager === 'gradle' && values.groupId && values.artifactId) {
        versions = await window.electronAPI.gradle.versions(values.groupId, values.artifactId)
      } else if (activeManager === 'go' && values.modulePath) {
        versions = await window.electronAPI.go.versions(values.modulePath, currentPath)
      } else if (activeManager === 'native' && values.version) {
        versions = [values.version]
      }
      setInstallVersionOptions(versions.map((version) => ({ value: version, label: version })))
    } catch {
      setInstallVersionOptions([])
    }
  }

  const submitInstall = async (values: any) => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    setLoading(true)
    try {
      if (activeManager === 'cargo') {
        await window.electronAPI.cargo.install({
          packageName: values.packageName,
          version: values.version,
          cwd: currentPath,
          type: values.type,
          features: values.features
        })
      } else if (activeManager === 'gradle') {
        await window.electronAPI.gradle.addDependency({
          cwd: currentPath,
          groupId: values.groupId,
          artifactId: values.artifactId,
          version: values.version,
          configuration: values.configuration || 'implementation'
        })
      } else if (activeManager === 'go') {
        await window.electronAPI.go.install({
          cwd: currentPath,
          modulePath: values.modulePath,
          version: values.version
        })
      } else {
        await window.electronAPI.native.install({
          cwd: currentPath,
          manager: values.manager || 'vcpkg',
          name: values.name,
          version: values.version,
          feature: values.feature
        })
      }
      setInstallVisible(false)
      await loadDependencies(activeManager)
      addNotification({ type: 'success', message: 'Dependency saved', description: activeManager })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Dependency update failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateDependency = async (record: any) => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    setLoading(true)
    try {
      if (activeManager === 'cargo') {
        await window.electronAPI.cargo.update({ cwd: currentPath, packageName: record.name })
      } else if (activeManager === 'gradle') {
        const versions = await window.electronAPI.gradle.versions(record.groupId, record.artifactId)
        const targetVersion = versions[0] || record.version
        await window.electronAPI.gradle.updateDependency({
          cwd: currentPath,
          groupId: record.groupId,
          artifactId: record.artifactId,
          version: targetVersion,
          configuration: record.configuration || 'implementation'
        })
      } else if (activeManager === 'go') {
        await window.electronAPI.go.update({ cwd: currentPath, modulePath: record.path })
      }
      await loadDependencies(activeManager)
      addNotification({ type: 'success', message: 'Dependency updated' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Update failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeDependency = async (record: any) => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    setLoading(true)
    try {
      if (activeManager === 'cargo') {
        await window.electronAPI.cargo.uninstall({ cwd: currentPath, packageName: record.name, type: record.type })
      } else if (activeManager === 'gradle') {
        await window.electronAPI.gradle.removeDependency({
          cwd: currentPath,
          groupId: record.groupId,
          artifactId: record.artifactId,
          configuration: record.configuration
        })
      } else if (activeManager === 'go') {
        await window.electronAPI.go.uninstall({ cwd: currentPath, modulePath: record.path })
      } else if (activeManager === 'native' && (record.manager === 'vcpkg' || record.manager === 'conan')) {
        await window.electronAPI.native.uninstall({ cwd: currentPath, manager: record.manager, name: record.name })
      }
      await loadDependencies(activeManager)
      addNotification({ type: 'success', message: 'Dependency removed' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Remove failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    if (!isRuntimeManager(activeManager)) return
    commandForm.setFieldsValue({ command: defaultCommands[activeManager] })
    setCommandVisible(true)
  }

  const runCommand = async (values: { command: string }) => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    setLoading(true)
    try {
      let result = ''
      if (activeManager === 'cargo') {
        result = await window.electronAPI.cargo.run(currentPath, values.command)
      } else if (activeManager === 'gradle') {
        result = await window.electronAPI.gradle.runTask(currentPath, values.command)
      } else if (activeManager === 'go') {
        result = await window.electronAPI.go.run(currentPath, values.command)
      } else {
        const parts = values.command.trim().split(/\s+/)
        const tool = parts[0] === 'cmake' || parts[0] === 'vcpkg' || parts[0] === 'conan'
          ? parts.shift() as 'cmake' | 'vcpkg' | 'conan'
          : 'cmake'
        const commandLine = parts.join(' ') || values.command
        result = await window.electronAPI.native.run({ cwd: currentPath, tool, commandLine })
      }
      setOutputTitle(`${activeManager} ${values.command}`)
      setOutput(result || 'Completed')
      setOutputVisible(true)
      setCommandVisible(false)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Command failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showGraph = async () => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    setLoading(true)
    try {
      let result = ''
      if (activeManager === 'cargo') {
        result = await window.electronAPI.cargo.tree(currentPath)
      } else if (activeManager === 'gradle') {
        result = await window.electronAPI.gradle.dependencyTree(currentPath)
      } else if (activeManager === 'go') {
        result = await window.electronAPI.go.graph(currentPath)
      } else {
        result = await window.electronAPI.native.list(currentPath).then((items) => JSON.stringify(items, null, 2))
      }
      setOutputTitle(`${activeManager} dependency graph`)
      setOutput(result || 'No graph output')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Graph failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runAudit = async () => {
    if (!currentPath || !isRuntimeManager(activeManager)) return
    if (activeManager === 'native') {
      setOutputTitle('native audit')
      setOutput('Native audit is not available. Use CMake/vcpkg/Conan commands for project-specific checks.')
      setOutputVisible(true)
      return
    }
    if (activeManager === 'gradle') {
      setOutputTitle('gradle audit')
      setOutput('Gradle audit is not available from the plugin workspace. Use the Gradle manager for dependency insight.')
      setOutputVisible(true)
      return
    }

    setLoading(true)
    try {
      const result = activeManager === 'cargo'
        ? await window.electronAPI.cargo.audit(currentPath)
        : await window.electronAPI.go.audit(currentPath)
      setOutputTitle(`${activeManager} audit`)
      setOutput([result.error, result.raw].filter(Boolean).join('\n') || 'No audit output')
      setOutputVisible(true)
      if (result.error) {
        addNotification({ type: 'warning', message: 'Audit tool unavailable', description: result.error })
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Audit failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showGradleInsight = async (record: GradleDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.gradle.dependencyInsight(currentPath, record.artifactId, record.configuration)
      setOutputTitle(`Gradle insight: ${record.groupId}:${record.artifactId}`)
      setOutput(result || 'No dependency insight output')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Dependency insight failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const dependencyColumns = useMemo<any[]>(() => {
    if (activeManager === 'cargo') {
      return [
        { title: 'Crate', dataIndex: 'name', key: 'name', width: 220, render: (text: string) => <Tag color="volcano">{text}</Tag> },
        { title: 'Version', dataIndex: 'version', key: 'version', width: 140, render: (text: string) => text || '-' },
        { title: 'Type', dataIndex: 'type', key: 'type', width: 170 },
        { title: 'Source', dataIndex: 'source', key: 'source', ellipsis: true, render: (text: string) => text || '-' },
        {
          title: 'Actions',
          key: 'actions',
          width: 190,
          render: (_: any, record: CargoDependencyInfo) => (
            <Space>
              <Button size="small" onClick={() => updateDependency(record)}>Update</Button>
              <Button size="small" danger onClick={() => removeDependency(record)}>Remove</Button>
            </Space>
          )
        }
      ]
    }

    if (activeManager === 'gradle') {
      return [
        { title: 'Group', dataIndex: 'groupId', key: 'groupId', width: 240 },
        { title: 'Artifact', dataIndex: 'artifactId', key: 'artifactId', width: 220, render: (text: string) => <Tag color="green">{text}</Tag> },
        { title: 'Version', dataIndex: 'version', key: 'version', width: 140 },
        { title: 'Configuration', dataIndex: 'configuration', key: 'configuration', width: 160 },
        {
          title: 'Actions',
          key: 'actions',
          width: 230,
          render: (_: any, record: GradleDependencyInfo) => (
            <Space>
              <Button size="small" onClick={() => showGradleInsight(record)}>Insight</Button>
              <Button size="small" onClick={() => updateDependency(record)}>Update</Button>
              <Button size="small" danger onClick={() => removeDependency(record)}>Remove</Button>
            </Space>
          )
        }
      ]
    }

    if (activeManager === 'native') {
      return [
        { title: 'Name', dataIndex: 'name', key: 'name', width: 220, render: (text: string) => <Tag color="gold">{text}</Tag> },
        { title: 'Manager', dataIndex: 'manager', key: 'manager', width: 130 },
        { title: 'Version', dataIndex: 'version', key: 'version', width: 140, render: (text: string) => text || '-' },
        { title: 'Linkage', dataIndex: 'linkage', key: 'linkage', width: 120, render: (text: string) => text || '-' },
        { title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true, render: (text: string) => text || '-' },
        {
          title: 'Actions',
          key: 'actions',
          width: 120,
          render: (_: any, record: NativeDependencyInfo) => (
            record.manager === 'vcpkg' || record.manager === 'conan'
              ? <Button size="small" danger onClick={() => removeDependency(record)}>Remove</Button>
              : null
          )
        }
      ]
    }

    return [
      { title: 'Module', dataIndex: 'path', key: 'path', width: 320, render: (text: string) => <Tag color="geekblue">{text}</Tag> },
      { title: 'Version', dataIndex: 'version', key: 'version', width: 140 },
      { title: 'Latest', dataIndex: 'latest', key: 'latest', width: 140, render: (text: string) => text || '-' },
      { title: 'Mode', dataIndex: 'indirect', key: 'indirect', width: 120, render: (value: boolean) => value ? <Tag>indirect</Tag> : <Tag color="blue">direct</Tag> },
      { title: 'Replace', dataIndex: 'replace', key: 'replace', ellipsis: true, render: (text: string) => text || '-' },
      {
        title: 'Actions',
        key: 'actions',
        width: 190,
        render: (_: any, record: GoModuleInfo) => (
          <Space>
            <Button size="small" onClick={() => updateDependency(record)}>Update</Button>
            <Button size="small" danger onClick={() => removeDependency(record)}>Remove</Button>
          </Space>
        )
      }
    ]
  }, [activeManager, currentPath])

  const dependencyRowKey = (record: any) => {
    if (activeManager === 'cargo') return `${record.type}:${record.name}`
    if (activeManager === 'gradle') return `${record.configuration}:${record.groupId}:${record.artifactId}`
    if (activeManager === 'native') return `${record.manager}:${record.name}:${record.path || ''}`
    return record.path
  }

  const pluginColumns = useMemo<any[]>(() => [
    {
      title: 'Component',
      dataIndex: 'name',
      key: 'name',
      width: 210,
      render: (text: string, record: PackageManagerPlugin) => (
        <Space orientation="vertical" size={2}>
          <Space>
            <Tag color={managerColors[record.id]}>{record.id}</Tag>
            <span>{text}</span>
          </Space>
          <span className={styles.muted}>{record.language}</span>
        </Space>
      )
    },
    {
      title: 'Project',
      key: 'detected',
      width: 120,
      render: (_: any, record: PackageManagerPlugin) => record.detected
        ? <Tag color="green">detected</Tag>
        : <Tag>idle</Tag>
    },
    {
      title: 'Tool',
      key: 'tool',
      width: 220,
      render: (_: any, record: PackageManagerPlugin) => record.available
        ? <Tooltip title={record.configuredPath || 'PATH'}><Tag color="green">{record.version || 'available'}</Tag></Tooltip>
        : <Tooltip title={record.message}><Tag color="red">missing</Tag></Tooltip>
    },
    {
      title: 'Files',
      dataIndex: 'manifestFiles',
      key: 'files',
      render: (items: string[]) => items.map((item) => <Tag key={item}>{item}</Tag>)
    },
    {
      title: 'Enabled',
      key: 'enabled',
      width: 110,
      render: (_: any, record: PackageManagerPlugin) => (
        <Switch checked={record.enabled} onChange={(checked) => setPluginEnabled(record.id, checked)} />
      )
    },
    {
      title: 'Open',
      key: 'open',
      width: 110,
      render: (_: any, record: PackageManagerPlugin) => (
        <Button
          size="small"
          onClick={() => {
            if (existingRoutes[record.id]) {
              navigate(existingRoutes[record.id]!)
            } else {
              setActiveManager(record.id)
            }
          }}
        >
          Open
        </Button>
      )
    }
  ], [navigate])

  const renderInstallForm = () => {
    if (activeManager === 'cargo') {
      return (
        <>
          <Form.Item name="packageName" label="Crate" rules={[{ required: true }]}>
            <AutoComplete
              options={installSearchOptions}
              onSearch={searchInstallCandidates}
              onSelect={selectInstallCandidate}
              placeholder="serde"
            />
          </Form.Item>
          <Form.Item name="version" label="Version">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete options={installVersionOptions} placeholder="1.0" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadInstallVersions}>Versions</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="type" label="Type">
            <Select
              options={[
                { value: 'dependencies', label: 'dependencies' },
                { value: 'dev-dependencies', label: 'dev-dependencies' },
                { value: 'build-dependencies', label: 'build-dependencies' }
              ]}
            />
          </Form.Item>
          <Form.Item name="features" label="Features">
            <Input placeholder="derive,alloc" />
          </Form.Item>
        </>
      )
    }

    if (activeManager === 'gradle') {
      return (
        <>
          <Form.Item name="groupId" label="GroupId" rules={[{ required: true }]}>
            <AutoComplete
              options={installSearchOptions}
              onSearch={searchInstallCandidates}
              onSelect={selectInstallCandidate}
              placeholder="org.springframework"
            />
          </Form.Item>
          <Form.Item name="artifactId" label="ArtifactId" rules={[{ required: true }]}>
            <AutoComplete
              options={installSearchOptions}
              onSearch={searchInstallCandidates}
              onSelect={selectInstallCandidate}
              placeholder="spring-core"
            />
          </Form.Item>
          <Form.Item name="version" label="Version" rules={[{ required: true }]}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle rules={[{ required: true }]}>
                <AutoComplete options={installVersionOptions} placeholder="6.1.0" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadInstallVersions}>Versions</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="configuration" label="Configuration">
            <AutoComplete
              options={[
                { value: 'implementation' },
                { value: 'api' },
                { value: 'compileOnly' },
                { value: 'runtimeOnly' },
                { value: 'testImplementation' }
              ]}
            />
          </Form.Item>
        </>
      )
    }

    if (activeManager === 'native') {
      return (
        <>
          <Form.Item name="manager" label="Manager" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'vcpkg', label: 'vcpkg' },
                { value: 'conan', label: 'Conan' }
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="Library" rules={[{ required: true }]}>
            <AutoComplete
              options={installSearchOptions}
              onSearch={searchInstallCandidates}
              onSelect={selectInstallCandidate}
              placeholder="openssl"
            />
          </Form.Item>
          <Form.Item name="version" label="Version">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="feature" label="vcpkg Feature">
            <Input placeholder="Optional" />
          </Form.Item>
        </>
      )
    }

    return (
      <>
        <Form.Item name="modulePath" label="Module" rules={[{ required: true }]}>
          <AutoComplete
            options={installSearchOptions}
            onSearch={searchInstallCandidates}
            onSelect={selectInstallCandidate}
            placeholder="github.com/gin-gonic/gin"
          />
        </Form.Item>
        <Form.Item name="version" label="Version">
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="version" noStyle>
              <AutoComplete options={installVersionOptions} placeholder="latest or v1.10.0" style={{ width: '100%' }} />
            </Form.Item>
            <Button onClick={loadInstallVersions}>Versions</Button>
          </Space.Compact>
        </Form.Item>
      </>
    )
  }

  const renderRuntimePanel = () => {
    if (!activePlugin) return null
    if (!activePlugin.enabled) {
      return <Alert type="warning" showIcon title="Component is disabled" />
    }
    if (!currentPath) {
      return <Alert type="info" showIcon title="Select a working directory" />
    }
    if (!isRuntimeManager(activeManager)) {
      return (
        <div className={styles.bridge}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Manager">{activePlugin.name}</Descriptions.Item>
            <Descriptions.Item label="Language">{activePlugin.language}</Descriptions.Item>
            <Descriptions.Item label="Status">{activePlugin.available ? 'available' : 'missing'}</Descriptions.Item>
          </Descriptions>
          <Button type="primary" onClick={() => navigate(existingRoutes[activeManager] || '/npm')}>
            Open Manager
          </Button>
        </div>
      )
    }

    return (
      <div className={styles.managerPanel}>
        <div className={styles.toolbar}>
          <Button icon={<ReloadOutlined />} onClick={() => loadDependencies(activeManager)} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openInstallModal}>Add</Button>
          <Button icon={<PlayCircleOutlined />} onClick={openCommandModal}>Run</Button>
          <Button icon={<BranchesOutlined />} onClick={showGraph} loading={loading}>Graph</Button>
          <Button icon={<SecurityScanOutlined />} onClick={runAudit} loading={loading}>Audit</Button>
          <Button icon={<WarningOutlined />} onClick={() => setHealthVisible(true)} loading={loading}>Diagnostics</Button>
        </div>
        <Spin spinning={loading}>
          {dependencies.length === 0 ? (
            <Empty description="No dependencies loaded" />
          ) : (
            <Table
              dataSource={dependencies}
              columns={dependencyColumns}
              rowKey={dependencyRowKey}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 980 }}
            />
          )}
        </Spin>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Plugin Components</h2>
          <div className={styles.subtitle}>Full-stack dependency managers and tool components</div>
        </div>
        <Space wrap>
          <span className={styles.pathValue}>{currentPath || 'No directory selected'}</span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>Select Folder</Button>
        </Space>
      </div>

      <Spin spinning={catalogLoading}>
        <div className={styles.catalog}>
          <div className={styles.sectionHeader}>
            <Space>
              <DeploymentUnitOutlined />
              <strong>Component Catalog</strong>
            </Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={loadCatalog}>Reload</Button>
          </div>
          <Table
            dataSource={plugins}
            columns={pluginColumns}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 1080 }}
          />
        </div>
      </Spin>

      <div className={styles.workspace}>
        <div className={styles.sectionHeader}>
          <Space>
            {activeManager === 'gradle' ? <ApartmentOutlined /> : <CodeOutlined />}
            <strong>Dependency Workspace</strong>
          </Space>
          {segmentedOptions.length > 0 && (
            <Segmented<PackageManagerId>
              value={activeManager}
              options={segmentedOptions}
              onChange={(value) => setActiveManager(value)}
            />
          )}
        </div>
        {renderRuntimePanel()}
      </div>

      <Modal
        title={`Add ${activeManager} dependency`}
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="Save"
      forceRender
      >
        <Form form={installForm} layout="vertical" onFinish={submitInstall}>
          {renderInstallForm()}
        </Form>
      </Modal>

      <Modal
        title={`Run ${activeManager}`}
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="Run"
      forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="command" label="Command" rules={[{ required: true }]}>
            <AutoComplete options={isRuntimeManager(activeManager) ? commandOptions[activeManager] : []} />
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

      {isRuntimeManager(activeManager) && (
        <DependencyHealthModal
          visible={healthVisible}
          manager={activeManager}
          cwd={currentPath}
          onClose={() => setHealthVisible(false)}
        />
      )}
    </div>
  )
}

export default PluginComponentsPage
