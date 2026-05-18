import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Empty, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip } from 'antd'
import {
  ApiOutlined,
  BuildOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import RuntimeManagerSwitch from '../../components/ManagerSwitch/RuntimeManagerSwitch'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './Native.module.css'

const NATIVE_MANAGER_OPTIONS = [
  { value: 'vcpkg', label: 'vcpkg manifest' },
  { value: 'conan', label: 'Conan requires' }
]

const NATIVE_COMMAND_OPTIONS = [
  { value: 'cmake', label: 'cmake', commands: ['-S . -B build', '--build build'] },
  { value: 'vcpkg', label: 'vcpkg', commands: ['install', 'list', 'search openssl'] },
  { value: 'conan', label: 'conan', commands: ['install . --output-folder=build --build=missing', 'graph info .'] }
]

const managerColor: Record<NativeDependencyManager, string> = {
  vcpkg: 'gold',
  conan: 'cyan',
  cmake: 'blue',
  library: 'purple'
}

const kindColor: Record<NativeLibraryKind, string> = {
  shared: 'green',
  static: 'volcano',
  import: 'geekblue',
  framework: 'purple'
}

function joinProjectPath(root: string, child: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${child.replace(/^[\\/]+/, '')}`
}

const NativePage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [projectInfo, setProjectInfo] = useState<NativeDetectResult | null>(null)
  const [dependencies, setDependencies] = useState<NativeDependencyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [healthVisible, setHealthVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; item?: NativeDependencyInfo }>>([])
  const [installForm] = Form.useForm()
  const [commandForm] = Form.useForm()

  const stats = useMemo(() => {
    const dynamicCount = dependencies.filter((item) => item.linkage === 'dynamic').length
    const staticCount = dependencies.filter((item) => item.linkage === 'static').length
    const declaredCount = dependencies.filter((item) => item.manager !== 'library').length

    return [
      { label: 'CMake', value: projectInfo?.hasCMakeLists ? 'CMakeLists.txt' : 'Not detected' },
      { label: 'Declared', value: String(declaredCount) },
      { label: 'Libraries', value: String(dependencies.length - declaredCount) },
      { label: 'Dynamic', value: String(dynamicCount) },
      { label: 'Static', value: String(staticCount) }
    ]
  }, [dependencies, projectInfo?.hasCMakeLists])

  const dependencyColumns = useMemo<any[]>(() => [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 230,
      render: (text: string, record: NativeDependencyInfo) => (
        <Space size={6} wrap>
          <Tag color={managerColor[record.manager]}>{text}</Tag>
          {record.kind && <Tag color={kindColor[record.kind]}>{record.kind}</Tag>}
        </Space>
      )
    },
    {
      title: 'Manager',
      dataIndex: 'manager',
      key: 'manager',
      width: 120,
      render: (text: NativeDependencyManager) => <Tag color={managerColor[text]}>{text}</Tag>
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 130,
      render: (text: string) => text || '-'
    },
    {
      title: 'Linkage',
      dataIndex: 'linkage',
      key: 'linkage',
      width: 110,
      render: (text: string) => text ? <Tag>{text}</Tag> : '-'
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 170,
      render: (text: string) => text || '-'
    },
    {
      title: 'Path / Features',
      key: 'path',
      ellipsis: true,
      render: (_: unknown, record: NativeDependencyInfo) => record.path || record.requiredBy || '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 230,
      render: (_: unknown, record: NativeDependencyInfo) => (
        <Space wrap size={6}>
          <Tooltip title={record.manager === 'conan' ? 'Open Conan Center' : record.manager === 'library' ? 'Open file location' : 'Open vcpkg package'}>
            <Button size="small" icon={<ExportOutlined />} onClick={() => openDependencyPage(record)} />
          </Tooltip>
          {(record.manager === 'vcpkg' || record.manager === 'conan') && (
            <Popconfirm
              title="Remove this native dependency?"
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeDependency(record)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ], [currentPath])

  useEffect(() => {
    void loadNativeProject()
  }, [currentPath])

  useDependencyHealthReminder('native', currentPath, !!currentPath && dependencies.length > 0)

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: 'Working directory changed', description: path })
  }

  const loadNativeProject = async () => {
    if (!currentPath) {
      setProjectInfo(null)
      setDependencies([])
      return
    }

    setLoading(true)
    try {
      const detected = await window.electronAPI.native.detect(currentPath)
      const deps = await window.electronAPI.native.list(currentPath)
      setProjectInfo(detected)
      setDependencies(deps)
    } catch (error: any) {
      setDependencies([])
      addNotification({ type: 'error', message: 'Native project load failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (filePath?: string) => {
    if (!filePath) return
    try {
      await window.electronAPI.system.openFile(filePath)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Open file failed', description: error.message })
    }
  }

  const openInstallModal = () => {
    installForm.resetFields()
    installForm.setFieldsValue({ manager: projectInfo?.hasConanfile && !projectInfo?.hasVcpkgManifest ? 'conan' : 'vcpkg' })
    setSearchOptions([])
    setInstallVisible(true)
  }

  const searchNativePackages = async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchOptions([])
      return
    }

    try {
      const result = await window.electronAPI.native.search(normalized)
      setSearchOptions(result.map((item) => ({
        value: item.name,
        label: `${item.name}${item.version ? ` (${item.version})` : ''} - ${item.manager}${item.source ? ` - ${item.source}` : ''}`,
        item
      })))
    } catch {
      setSearchOptions([])
    }
  }

  const selectNativePackage = (_: string, option: any) => {
    const item = option.item as NativeDependencyInfo | undefined
    if (!item) return
    installForm.setFieldsValue({
      name: item.name,
      version: item.version,
      manager: item.manager === 'conan' ? 'conan' : 'vcpkg'
    })
  }

  const addDependency = async (values: { manager: 'vcpkg' | 'conan'; name: string; version?: string; feature?: string }) => {
    if (!currentPath) {
      addNotification({ type: 'warning', message: 'Select a native project folder first' })
      return
    }

    setLoading(true)
    try {
      const result = await window.electronAPI.native.install({
        cwd: currentPath,
        manager: values.manager,
        name: values.name,
        version: values.version,
        feature: values.feature
      })
      setInstallVisible(false)
      installForm.resetFields()
      await loadNativeProject()
      addNotification({ type: 'success', message: 'Native dependency saved', description: result })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Native dependency save failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeDependency = async (record: NativeDependencyInfo) => {
    if (!currentPath || (record.manager !== 'vcpkg' && record.manager !== 'conan')) return
    setLoading(true)
    try {
      const result = await window.electronAPI.native.uninstall({
        cwd: currentPath,
        manager: record.manager,
        name: record.name
      })
      await loadNativeProject()
      addNotification({ type: 'success', message: 'Native dependency removed', description: result })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Native dependency remove failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const configureCMake = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.native.configure(currentPath, 'build')
      setOutputTitle('cmake -S . -B build')
      setOutput(result || 'Completed')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'CMake configure failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const buildCMake = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.native.build(currentPath, 'build')
      setOutputTitle('cmake --build build')
      setOutput(result || 'Completed')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'CMake build failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    commandForm.setFieldsValue({ tool: 'cmake', commandLine: '-S . -B build' })
    setCommandVisible(true)
  }

  const runCommand = async (values: { tool: 'cmake' | 'vcpkg' | 'conan'; commandLine: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.native.run({
        cwd: currentPath,
        tool: values.tool,
        commandLine: values.commandLine
      })
      setOutputTitle(`${values.tool} ${values.commandLine}`)
      setOutput(result || 'Completed')
      setOutputVisible(true)
      setCommandVisible(false)
      await loadNativeProject()
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Native command failed', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openDependencyPage = async (record: NativeDependencyInfo) => {
    try {
      if (record.manager === 'library' && record.path) {
        await window.electronAPI.system.openFile(joinProjectPath(currentPath, record.path))
        return
      }
      const url = record.manager === 'conan'
        ? `https://conan.io/center/recipes/${encodeURIComponent(record.name)}`
        : `https://vcpkg.io/en/package/${encodeURIComponent(record.name)}`
      await window.electronAPI.openExternal(url)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Open dependency failed', description: error.message })
    }
  }

  const actionsDisabled = !currentPath

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>C/C++ Native</h2>
            <div className={styles.subtitle}>Manage CMake, vcpkg, Conan, and project dynamic/static libraries.</div>
          </div>
          <RuntimeManagerSwitch active="native" />
        </div>
        <Space className={styles.actions} wrap>
          <span className={styles.pathValue}>{currentPath || 'No directory selected'}</span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>Select Folder</Button>
        </Space>
      </div>

      <div className={styles.summaryGrid}>
        {stats.map((item) => (
          <div key={item.label} className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      {!currentPath && (
        <Alert type="info" showIcon title="Select a C/C++ project folder to load manifests and libraries." />
      )}
      {currentPath && projectInfo && !projectInfo.hasNativeProject && (
        <Alert
          type="warning"
          showIcon
          title="No CMakeLists.txt, vcpkg.json, or conanfile was detected."
          description="You can still scan libraries and create vcpkg.json or conanfile.txt by adding a dependency."
        />
      )}

      <div className={styles.workspace}>
        <div className={styles.sectionHeader}>
          <Space>
            <ApiOutlined />
            <strong>Native Dependencies</strong>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadNativeProject} loading={loading} disabled={!currentPath}>Refresh</Button>
            <Button icon={<FileTextOutlined />} onClick={() => openFile(projectInfo?.cmakePath)} disabled={!projectInfo?.hasCMakeLists}>CMakeLists</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openInstallModal} disabled={actionsDisabled}>Add</Button>
            <Button icon={<ToolOutlined />} onClick={configureCMake} loading={loading} disabled={actionsDisabled || !projectInfo?.hasCMakeLists}>Configure</Button>
            <Button icon={<BuildOutlined />} onClick={buildCMake} loading={loading} disabled={actionsDisabled}>Build</Button>
            <Button icon={<PlayCircleOutlined />} onClick={openCommandModal} disabled={actionsDisabled}>Run</Button>
            <Button icon={<WarningOutlined />} onClick={() => setHealthVisible(true)} disabled={actionsDisabled}>Diagnostics</Button>
          </Space>
        </div>

        {projectInfo && (
          <Descriptions bordered size="small" column={1} className={styles.manifestInfo}>
            <Descriptions.Item label="CMake">{projectInfo.hasCMakeLists ? projectInfo.cmakePath : '-'}</Descriptions.Item>
            <Descriptions.Item label="vcpkg">{projectInfo.hasVcpkgManifest ? projectInfo.vcpkgPath : '-'}</Descriptions.Item>
            <Descriptions.Item label="Conan">{projectInfo.hasConanfile ? projectInfo.conanfilePath : '-'}</Descriptions.Item>
          </Descriptions>
        )}

        <Spin spinning={loading}>
          {dependencies.length === 0 ? (
            <Empty description={currentPath ? 'No native dependencies or libraries found' : 'No native project loaded'} />
          ) : (
            <Table
              dataSource={dependencies}
              columns={dependencyColumns}
              rowKey={(record) => `${record.manager}:${record.name}:${record.path || ''}`}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 1180 }}
            />
          )}
        </Spin>
      </div>

      <Modal
        title="Add Native Dependency"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="Save"
      forceRender
      >
        <Form form={installForm} layout="vertical" onFinish={addDependency}>
          <Form.Item name="manager" label="Manager" rules={[{ required: true }]}>
            <Select options={NATIVE_MANAGER_OPTIONS} />
          </Form.Item>
          <Form.Item name="name" label="Library" rules={[{ required: true, message: 'Enter a library name' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchNativePackages}
              onSelect={selectNativePackage}
              placeholder="openssl"
            />
          </Form.Item>
          <Form.Item name="version" label="Version">
            <Input placeholder="Optional, for example 3.2.1 or 1.2.13" />
          </Form.Item>
          <Form.Item name="feature" label="vcpkg Feature">
            <Input placeholder="Optional, for example ssl or zlib" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Run Native Tool"
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="Run"
      forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="tool" label="Tool" rules={[{ required: true }]}>
            <Select
              options={NATIVE_COMMAND_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(tool) => {
                const option = NATIVE_COMMAND_OPTIONS.find((item) => item.value === tool)
                commandForm.setFieldsValue({ commandLine: option?.commands[0] || '' })
              }}
            />
          </Form.Item>
          <Form.Item name="commandLine" label="Arguments" rules={[{ required: true, message: 'Enter command arguments' }]}>
            <AutoComplete
              options={(NATIVE_COMMAND_OPTIONS.find((item) => item.value === commandForm.getFieldValue('tool'))?.commands || [])
                .map((command) => ({ value: command, label: command }))}
              placeholder="-S . -B build"
            />
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

      <DependencyHealthModal
        visible={healthVisible}
        manager="native"
        cwd={currentPath}
        onClose={() => setHealthVisible(false)}
      />
    </div>
  )
}

export default NativePage
