import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Empty, Form, Modal, Popconfirm, Space, Spin, Table, Tag, Tooltip } from 'antd'
import {
  BranchesOutlined,
  CheckCircleOutlined,
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
import styles from './Go.module.css'

const GO_COMMAND_OPTIONS = [
  { value: 'test ./...', label: 'go test ./...' },
  { value: 'build ./...', label: 'go build ./...' },
  { value: 'run .', label: 'go run .' },
  { value: 'mod tidy', label: 'go mod tidy' },
  { value: 'mod graph', label: 'go mod graph' },
  { value: 'list -m all', label: 'go list -m all' },
  { value: 'vet ./...', label: 'go vet ./...' }
]

const GoPage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [moduleInfo, setModuleInfo] = useState<{ hasGoMod: boolean; path: string } | null>(null)
  const [modules, setModules] = useState<GoModuleInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [selectedModule, setSelectedModule] = useState<GoModuleInfo | null>(null)
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; item?: GoModuleInfo }>>([])
  const [versionOptions, setVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [moduleForm] = Form.useForm()
  const [commandForm] = Form.useForm()

  const moduleStats = useMemo(() => {
    const indirectCount = modules.filter((item) => item.indirect).length
    const updateCount = modules.filter((item) => item.latest && item.latest !== item.version).length

    return [
      { label: '清单', value: moduleInfo?.hasGoMod ? 'go.mod' : '未检测到' },
      { label: '模块数', value: String(modules.length) },
      { label: '直接', value: String(modules.length - indirectCount) },
      { label: '间接', value: String(indirectCount) },
      { label: '可更新', value: String(updateCount) }
    ]
  }, [modules, moduleInfo?.hasGoMod])

  const moduleColumns = useMemo<any[]>(() => [
    {
      title: '模块',
      dataIndex: 'path',
      key: 'path',
      width: 360,
      ellipsis: true,
      render: (text: string, record: GoModuleInfo) => (
        <Space size={6} wrap>
          <Tag color="geekblue">{text}</Tag>
          {record.repositoryUrl && <Tag>github</Tag>}
        </Space>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 150,
      render: (text: string) => text || '-'
    },
    {
      title: '最新',
      dataIndex: 'latest',
      key: 'latest',
      width: 150,
      render: (text: string, record: GoModuleInfo) => text && text !== record.version
        ? <Tag color="orange">{text}</Tag>
        : text || '-'
    },
    {
      title: '模式',
      dataIndex: 'indirect',
      key: 'indirect',
      width: 120,
      render: (value: boolean) => value ? <Tag>indirect</Tag> : <Tag color="blue">direct</Tag>
    },
    {
      title: '替换',
      dataIndex: 'replace',
      key: 'replace',
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      render: (_: unknown, record: GoModuleInfo) => (
        <Space wrap size={6}>
          <Button size="small" onClick={() => showModuleVersions(record)}>版本</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={() => updateModule(record)}>更新</Button>
          <Tooltip title="打开 pkg.go.dev">
            <Button size="small" icon={<ExportOutlined />} onClick={() => openModulePage(record)} />
          </Tooltip>
          <Popconfirm
            title="确认移除此模块？"
            okText="移除"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeModule(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ], [])

  useEffect(() => {
    void loadGoProject()
  }, [currentPath])

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: '工作目录已切换', description: path })
  }

  const loadGoProject = async () => {
    if (!currentPath) {
      setModuleInfo(null)
      setModules([])
      return
    }

    setLoading(true)
    try {
      const detected = await window.electronAPI.go.detect(currentPath)
      setModuleInfo(detected)
      if (!detected.hasGoMod) {
        setModules([])
        return
      }
      setModules(await window.electronAPI.go.list(currentPath))
    } catch (error: any) {
      setModules([])
      addNotification({ type: 'error', message: '加载 Go 项目失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openGoMod = async () => {
    if (!moduleInfo?.hasGoMod) return
    try {
      await window.electronAPI.system.openFile(moduleInfo.path)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 go.mod 失败', description: error.message })
    }
  }

  const openInstallModal = () => {
    moduleForm.resetFields()
    setSearchOptions([])
    setVersionOptions([])
    setInstallVisible(true)
  }

  const searchModules = async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchOptions([])
      return
    }

    try {
      const result = await window.electronAPI.go.search(normalized, currentPath)
      setSearchOptions(result.map((item) => ({
        value: item.path,
        label: `${item.path}${item.version ? ` (${item.version})` : ''}${item.description ? ` - ${item.description}` : ''}${item.stars ? ` - ${item.stars} stars` : ''}`,
        item
      })))
    } catch {
      setSearchOptions([])
    }
  }

  const selectModule = (_: string, option: any) => {
    const item = option.item as GoModuleInfo | undefined
    if (!item) return
    moduleForm.setFieldsValue({
      modulePath: item.path,
      version: item.latest || item.version
    })
    const version = item.latest || item.version
    setVersionOptions(version ? [{ value: version, label: version }] : [])
  }

  const loadModuleVersions = async () => {
    const modulePath = moduleForm.getFieldValue('modulePath')
    if (!modulePath) return

    try {
      const versions = await window.electronAPI.go.versions(modulePath, currentPath)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length === 0) {
        addNotification({ type: 'info', message: '未返回版本信息', description: modulePath })
      }
    } catch (error: any) {
      setVersionOptions([])
      addNotification({ type: 'error', message: '加载 Go 模块版本失败', description: error.message })
    }
  }

  const addModule = async (values: { modulePath: string; version?: string }) => {
    if (!currentPath) {
      addNotification({ type: 'warning', message: '请先选择 Go 项目目录' })
      return
    }

    setLoading(true)
    try {
      const result = await window.electronAPI.go.install({
        cwd: currentPath,
        modulePath: values.modulePath,
        version: values.version
      })
      setInstallVisible(false)
      moduleForm.resetFields()
      await loadGoProject()
      if (result) {
        setOutputTitle(`go get ${values.modulePath}`)
        setOutput(result)
        setOutputVisible(true)
      }
      addNotification({ type: 'success', message: 'Go 模块已添加', description: values.modulePath })
    } catch (error: any) {
      addNotification({ type: 'error', message: '添加 Go 模块失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateModule = async (record: GoModuleInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.update({ cwd: currentPath, modulePath: record.path })
      await loadGoProject()
      setOutputTitle(`go get -u ${record.path}@latest`)
      setOutput(result || '已完成')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Go 模块已更新', description: record.path })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Go 更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateAllModules = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.update({ cwd: currentPath })
      await loadGoProject()
      setOutputTitle('go get -u ./...')
      setOutput(result || '已完成')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Go 模块已全部更新' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Go 全量更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeModule = async (record: GoModuleInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.uninstall({ cwd: currentPath, modulePath: record.path })
      await loadGoProject()
      if (result) {
        setOutputTitle(`go get ${record.path}@none`)
        setOutput(result)
        setOutputVisible(true)
      }
      addNotification({ type: 'success', message: 'Go 模块已移除', description: record.path })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Go 模块失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showModuleVersions = async (record: GoModuleInfo) => {
    setSelectedModule(record)
    setVersionOptions([])
    setVersionVisible(true)
    setLoading(true)
    try {
      const versions = await window.electronAPI.go.versions(record.path, currentPath)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
    } catch (error: any) {
      addNotification({ type: 'error', message: '加载 Go 模块版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const installSelectedVersion = async (version: string) => {
    if (!currentPath || !selectedModule) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.install({
        cwd: currentPath,
        modulePath: selectedModule.path,
        version
      })
      setVersionVisible(false)
      await loadGoProject()
      if (result) {
        setOutputTitle(`go get ${selectedModule.path}@${version}`)
        setOutput(result)
        setOutputVisible(true)
      }
      addNotification({ type: 'success', message: 'Go 模块版本已切换', description: `${selectedModule.path}@${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: '切换 Go 模块版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runTidy = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.tidy(currentPath)
      await loadGoProject()
      setOutputTitle('go mod tidy')
      setOutput(result || '已完成')
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'go mod tidy 已完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'go mod tidy 失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    commandForm.setFieldsValue({ command: 'test ./...' })
    setCommandVisible(true)
  }

  const runCommand = async (values: { command: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.run(currentPath, values.command)
      setOutputTitle(`go ${values.command}`)
      setOutput(result || '已完成')
      setOutputVisible(true)
      setCommandVisible(false)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Go 命令执行失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showModuleGraph = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.graph(currentPath)
      setOutputTitle('go mod graph')
      setOutput(result || '没有模块图输出')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 Go 模块图失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const runAudit = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.go.audit(currentPath)
      setOutputTitle('govulncheck -json ./...')
      setOutput([result.error, result.raw].filter(Boolean).join('\n') || '没有审计输出')
      setOutputVisible(true)
      if (result.error) {
        addNotification({ type: 'warning', message: 'govulncheck 不可用或返回了问题', description: result.error })
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Go 安全审计失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openModulePage = async (record: GoModuleInfo) => {
    const url = record.repositoryUrl || `https://pkg.go.dev/${record.path}`
    try {
      await window.electronAPI.openExternal(url)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 Go 模块页面失败', description: error.message })
    }
  }

  const hasGoMod = !!moduleInfo?.hasGoMod
  const actionsDisabled = !currentPath || !hasGoMod

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>Go 管理</h2>
            <div className={styles.subtitle}>管理 go.mod 模块、GitHub 模块搜索、版本更新、tidy、graph 与漏洞检查。</div>
          </div>
          <RuntimeManagerSwitch active="go" />
        </div>
        <Space className={styles.actions} wrap>
          <span className={styles.pathValue}>{currentPath || '未选择目录'}</span>
          <Button icon={<FolderOpenOutlined />} onClick={chooseDirectory}>选择目录</Button>
        </Space>
      </div>

      <div className={styles.summaryGrid}>
        {moduleStats.map((item) => (
          <div key={item.label} className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      {!currentPath && (
        <Alert type="info" showIcon title="选择 Go 项目目录以加载 go.mod 模块。" />
      )}
      {currentPath && moduleInfo && !moduleInfo.hasGoMod && (
        <Alert
          type="warning"
          showIcon
          title="所选目录未检测到 go.mod。"
          description="添加或更新依赖前，请选择 Go module 根目录。"
        />
      )}

      <div className={styles.workspace}>
        <div className={styles.sectionHeader}>
          <Space>
            <CodeOutlined />
            <strong>项目模块</strong>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadGoProject} loading={loading} disabled={!currentPath}>刷新</Button>
            <Button icon={<FileTextOutlined />} onClick={openGoMod} disabled={!hasGoMod}>打开 go.mod</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openInstallModal} disabled={actionsDisabled}>添加模块</Button>
            <Button icon={<SyncOutlined />} onClick={updateAllModules} loading={loading} disabled={actionsDisabled}>更新全部</Button>
            <Button icon={<CheckCircleOutlined />} onClick={runTidy} loading={loading} disabled={actionsDisabled}>Tidy</Button>
            <Button icon={<PlayCircleOutlined />} onClick={openCommandModal} disabled={actionsDisabled}>运行</Button>
            <Button icon={<BranchesOutlined />} onClick={showModuleGraph} loading={loading} disabled={actionsDisabled}>模块图</Button>
            <Button icon={<SafetyCertificateOutlined />} onClick={runAudit} loading={loading} disabled={actionsDisabled}>安全审计</Button>
          </Space>
        </div>

        {hasGoMod && (
          <Descriptions bordered size="small" column={1} className={styles.manifestInfo}>
            <Descriptions.Item label="清单">{moduleInfo?.path}</Descriptions.Item>
          </Descriptions>
        )}

        <Spin spinning={loading}>
          {modules.length === 0 ? (
            <Empty description={hasGoMod ? '无 Go 模块' : '未加载 Go 项目'} />
          ) : (
            <Table
              dataSource={modules}
              columns={moduleColumns}
              rowKey={(record) => record.path}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 1300 }}
            />
          )}
        </Spin>
      </div>

      <Modal
        title="添加 Go 模块"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => moduleForm.submit()}
        okText="添加"
      forceRender
      >
        <Form form={moduleForm} layout="vertical" onFinish={addModule}>
          <Form.Item name="modulePath" label="模块" rules={[{ required: true, message: '请输入 Go 模块路径' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchModules}
              onSelect={selectModule}
              placeholder="github.com/gin-gonic/gin"
            />
          </Form.Item>
          <Form.Item label="版本">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete options={versionOptions} placeholder="latest 或 v1.10.0" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadModuleVersions}>版本</Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="运行 Go 命令"
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="运行"
      forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="command" label="命令" rules={[{ required: true, message: '请输入 Go 命令' }]}>
            <AutoComplete options={GO_COMMAND_OPTIONS} placeholder="test ./..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`版本 - ${selectedModule?.path || ''}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={620}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="geekblue">{selectedModule?.version || '-'}</Tag></span>
          <div className={styles.versions}>
            {versionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              versionOptions.map((item) => (
                <Tag
                  key={item.value}
                  color={item.value === selectedModule?.version ? 'geekblue' : 'default'}
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

export default GoPage
