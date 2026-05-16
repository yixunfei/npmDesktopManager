import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Empty, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip } from 'antd'
import {
  BranchesOutlined,
  CodeOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import RuntimeManagerSwitch from '../../components/ManagerSwitch/RuntimeManagerSwitch'
import styles from './Cargo.module.css'

type CargoDependencyType = CargoDependencyInfo['type']

const CARGO_TYPE_OPTIONS: Array<{ value: CargoDependencyType; label: string }> = [
  { value: 'dependencies', label: 'dependencies' },
  { value: 'dev-dependencies', label: 'dev-dependencies' },
  { value: 'build-dependencies', label: 'build-dependencies' }
]

const CARGO_COMMAND_OPTIONS = [
  { value: 'check', label: 'cargo check' },
  { value: 'test', label: 'cargo test' },
  { value: 'build', label: 'cargo build' },
  { value: 'run', label: 'cargo run' },
  { value: 'tree', label: 'cargo tree' },
  { value: 'clippy', label: 'cargo clippy' },
  { value: 'fmt', label: 'cargo fmt' },
  { value: 'doc --no-deps', label: 'cargo doc --no-deps' }
]

const typeColor: Record<CargoDependencyType, string> = {
  dependencies: 'volcano',
  'dev-dependencies': 'geekblue',
  'build-dependencies': 'purple'
}

const CargoPage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [manifestInfo, setManifestInfo] = useState<{ hasCargoToml: boolean; path: string } | null>(null)
  const [dependencies, setDependencies] = useState<CargoDependencyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [selectedDependency, setSelectedDependency] = useState<CargoDependencyInfo | null>(null)
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; item?: CargoSearchResult }>>([])
  const [versionOptions, setVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [installForm] = Form.useForm()
  const [commandForm] = Form.useForm()

  const dependencyStats = useMemo(() => {
    const byType = dependencies.reduce<Record<CargoDependencyType, number>>((acc, item) => {
      acc[item.type] += 1
      return acc
    }, {
      dependencies: 0,
      'dev-dependencies': 0,
      'build-dependencies': 0
    })

    return [
      { label: '清单', value: manifestInfo?.hasCargoToml ? 'Cargo.toml' : '未检测到' },
      { label: 'Crate 数', value: String(dependencies.length) },
      { label: '运行时', value: String(byType.dependencies) },
      { label: '开发', value: String(byType['dev-dependencies']) },
      { label: '构建', value: String(byType['build-dependencies']) }
    ]
  }, [dependencies, manifestInfo?.hasCargoToml])

  const dependencyColumns = useMemo<any[]>(() => [
    {
      title: 'Crate',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (text: string, record: CargoDependencyInfo) => (
        <Space size={6} wrap>
          <Tag color="volcano">{text}</Tag>
          {record.optional && <Tag>optional</Tag>}
        </Space>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 150,
      render: (text: string) => text || <Tag>workspace/path</Tag>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 170,
      render: (text: CargoDependencyType) => <Tag color={typeColor[text]}>{text}</Tag>
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      ellipsis: true,
      render: (text: string) => text || 'crates.io'
    },
    {
      title: '操作',
      key: 'actions',
      width: 330,
      render: (_: unknown, record: CargoDependencyInfo) => (
        <Space wrap size={6}>
          <Button size="small" onClick={() => showDependencyVersions(record)}>版本</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={() => updateDependency(record)}>更新</Button>
          <Tooltip title="打开 crates.io">
            <Button size="small" icon={<ExportOutlined />} onClick={() => openCratePage(record.name)} />
          </Tooltip>
          <Popconfirm
            title="确认移除此 crate？"
            okText="移除"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeDependency(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ], [currentPath])

  useEffect(() => {
    void loadCargoProject()
  }, [currentPath])

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: '工作目录已切换', description: path })
  }

  const loadCargoProject = async () => {
    if (!currentPath) {
      setManifestInfo(null)
      setDependencies([])
      return
    }

    setLoading(true)
    try {
      const detected = await window.electronAPI.cargo.detect(currentPath)
      setManifestInfo(detected)
      if (!detected.hasCargoToml) {
        setDependencies([])
        return
      }
      setDependencies(await window.electronAPI.cargo.list(currentPath))
    } catch (error: any) {
      setDependencies([])
      addNotification({ type: 'error', message: '加载 Cargo 项目失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openManifest = async () => {
    if (!manifestInfo?.hasCargoToml) return
    try {
      await window.electronAPI.system.openFile(manifestInfo.path)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 Cargo.toml 失败', description: error.message })
    }
  }

  const openInstallModal = () => {
    installForm.resetFields()
    installForm.setFieldsValue({ type: 'dependencies' })
    setSearchOptions([])
    setVersionOptions([])
    setInstallVisible(true)
  }

  const searchCrates = async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchOptions([])
      return
    }

    try {
      const result = await window.electronAPI.cargo.search(normalized)
      setSearchOptions(result.map((item) => ({
        value: item.name,
        label: `${item.name}${item.version ? ` (${item.version})` : ''}${item.description ? ` - ${item.description}` : ''}`,
        item
      })))
    } catch {
      setSearchOptions([])
    }
  }

  const selectCrate = (_: string, option: any) => {
    const item = option.item as CargoSearchResult | undefined
    if (!item) return
    installForm.setFieldsValue({
      packageName: item.name,
      version: item.version
    })
    setVersionOptions(item.version ? [{ value: item.version, label: item.version }] : [])
  }

  const loadInstallVersions = async () => {
    const packageName = installForm.getFieldValue('packageName')
    if (!packageName) return

    try {
      const versions = await window.electronAPI.cargo.versions(packageName)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length === 0) {
        addNotification({ type: 'info', message: '未返回版本信息', description: packageName })
      }
    } catch (error: any) {
      setVersionOptions([])
      addNotification({ type: 'error', message: '加载 crate 版本失败', description: error.message })
    }
  }

  const addDependency = async (values: { packageName: string; version?: string; type?: CargoDependencyType; features?: string }) => {
    if (!currentPath) {
      addNotification({ type: 'warning', message: '请先选择 Cargo 项目目录' })
      return
    }

    setLoading(true)
    try {
      await window.electronAPI.cargo.install({
        packageName: values.packageName,
        version: values.version,
        cwd: currentPath,
        type: values.type,
        features: values.features
      })
      setInstallVisible(false)
      installForm.resetFields()
      await loadCargoProject()
      addNotification({ type: 'success', message: 'Cargo 依赖已添加', description: values.packageName })
    } catch (error: any) {
      addNotification({ type: 'error', message: '添加 Cargo 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateDependency = async (record: CargoDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.cargo.update({ cwd: currentPath, packageName: record.name })
      await loadCargoProject()
      if (result) {
        setOutputTitle(`cargo update -p ${record.name}`)
        setOutput(result)
        setOutputVisible(true)
      }
      addNotification({ type: 'success', message: 'Cargo 依赖已更新', description: record.name })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Cargo 更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateAllDependencies = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.cargo.update({ cwd: currentPath })
      await loadCargoProject()
      setOutputTitle('cargo update')
      setOutput(result || 'Completed')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Cargo 依赖已全部更新' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Cargo 更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeDependency = async (record: CargoDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.cargo.uninstall({ cwd: currentPath, packageName: record.name, type: record.type })
      await loadCargoProject()
      addNotification({ type: 'success', message: 'Cargo 依赖已移除', description: record.name })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Cargo 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyVersions = async (record: CargoDependencyInfo) => {
    setSelectedDependency(record)
    setVersionOptions([])
    setVersionVisible(true)
    setLoading(true)
    try {
      const versions = await window.electronAPI.cargo.versions(record.name)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
    } catch (error: any) {
      addNotification({ type: 'error', message: '加载 crate 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const installSelectedVersion = async (version: string) => {
    if (!currentPath || !selectedDependency) return
    setLoading(true)
    try {
      await window.electronAPI.cargo.install({
        cwd: currentPath,
        packageName: selectedDependency.name,
        version,
        type: selectedDependency.type
      })
      setVersionVisible(false)
      await loadCargoProject()
      addNotification({ type: 'success', message: 'Cargo 版本已切换', description: `${selectedDependency.name}@${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: '切换 Cargo 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    commandForm.setFieldsValue({ command: 'check' })
    setCommandVisible(true)
  }

  const runCommand = async (values: { command: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.cargo.run(currentPath, values.command)
      setOutputTitle(`cargo ${values.command}`)
      setOutput(result || '已完成')
      setOutputVisible(true)
      setCommandVisible(false)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Cargo 命令执行失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyTree = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.cargo.tree(currentPath)
      setOutputTitle('cargo tree')
      setOutput(result || '没有依赖树输出')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 Cargo 依赖树失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runAudit = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.cargo.audit(currentPath)
      setOutputTitle('cargo audit')
      setOutput([result.error, result.raw].filter(Boolean).join('\n') || '没有审计输出')
      setOutputVisible(true)
      if (result.error) {
        addNotification({ type: 'warning', message: 'cargo-audit 不可用或返回了问题', description: result.error })
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Cargo 安全审计失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCratePage = async (crateName: string) => {
    try {
      await window.electronAPI.openExternal(`https://crates.io/crates/${encodeURIComponent(crateName)}`)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 crates.io 失败', description: error.message })
    }
  }

  const hasCargoToml = !!manifestInfo?.hasCargoToml
  const actionsDisabled = !currentPath || !hasCargoToml

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>Cargo 管理</h2>
            <div className={styles.subtitle}>管理 Rust crates、Cargo.toml 依赖、命令运行、依赖树与安全审计。</div>
          </div>
          <RuntimeManagerSwitch active="cargo" />
        </div>
        <Space className={styles.actions} wrap>
          <span className={styles.pathValue}>{currentPath || '未选择目录'}</span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>选择目录</Button>
        </Space>
      </div>

      <div className={styles.summaryGrid}>
        {dependencyStats.map((item) => (
          <div key={item.label} className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      {!currentPath && (
        <Alert type="info" showIcon title="选择 Rust 项目目录以加载 Cargo.toml 依赖。" />
      )}
      {currentPath && manifestInfo && !manifestInfo.hasCargoToml && (
        <Alert
          type="warning"
          showIcon
          title="所选目录未检测到 Cargo.toml。"
          description="添加或更新 crate 前，请选择 Rust 项目根目录。"
        />
      )}

      <div className={styles.workspace}>
        <div className={styles.sectionHeader}>
          <Space>
            <CodeOutlined />
            <strong>项目依赖</strong>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadCargoProject} loading={loading} disabled={!currentPath}>刷新</Button>
            <Button icon={<FileTextOutlined />} onClick={openManifest} disabled={!hasCargoToml}>打开 Cargo.toml</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openInstallModal} disabled={actionsDisabled}>添加 Crate</Button>
            <Button icon={<SyncOutlined />} onClick={updateAllDependencies} loading={loading} disabled={actionsDisabled}>更新全部</Button>
            <Button icon={<PlayCircleOutlined />} onClick={openCommandModal} disabled={actionsDisabled}>运行</Button>
            <Button icon={<BranchesOutlined />} onClick={showDependencyTree} loading={loading} disabled={actionsDisabled}>依赖树</Button>
            <Button icon={<SafetyCertificateOutlined />} onClick={runAudit} loading={loading} disabled={actionsDisabled}>安全审计</Button>
          </Space>
        </div>

        {hasCargoToml && (
          <Descriptions bordered size="small" column={1} className={styles.manifestInfo}>
            <Descriptions.Item label="清单">{manifestInfo?.path}</Descriptions.Item>
          </Descriptions>
        )}

        <Spin spinning={loading}>
          {dependencies.length === 0 ? (
            <Empty description={hasCargoToml ? '无 Cargo 依赖' : '未加载 Cargo 项目'} />
          ) : (
            <Table
              dataSource={dependencies}
              columns={dependencyColumns}
              rowKey={(record) => `${record.type}:${record.name}`}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 1100 }}
            />
          )}
        </Spin>
      </div>

      <Modal
        title="添加 Cargo Crate"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="添加"
      forceRender
      >
        <Form form={installForm} layout="vertical" onFinish={addDependency}>
          <Form.Item name="packageName" label="Crate" rules={[{ required: true, message: '请输入 crate 名称' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchCrates}
              onSelect={selectCrate}
              placeholder="serde"
            />
          </Form.Item>
          <Form.Item label="版本">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete options={versionOptions} placeholder="默认 latest" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadInstallVersions}>版本</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="type" label="分组">
            <Select options={CARGO_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="features" label="Features">
            <Input placeholder="derive,alloc" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="运行 Cargo 命令"
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="运行"
      forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="command" label="命令" rules={[{ required: true, message: '请输入 Cargo 命令' }]}>
            <AutoComplete options={CARGO_COMMAND_OPTIONS} placeholder="check" />
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
          <span>当前版本: <Tag color="volcano">{selectedDependency?.version || '-'}</Tag></span>
          <div className={styles.versions}>
            {versionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              versionOptions.map((item) => (
                <Tag
                  key={item.value}
                  color={item.value === selectedDependency?.version ? 'volcano' : 'default'}
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
        title={outputTitle}
        open={outputVisible}
        onCancel={() => setOutputVisible(false)}
        footer={null}
        width={900}
      >
        <pre className={styles.output}>{output}</pre>
      </Modal>
    </div>
  )
}

export default CargoPage
