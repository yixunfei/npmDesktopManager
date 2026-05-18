import React, { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Empty, Form, Modal, Popconfirm, Space, Spin, Table, Tag, Tooltip } from 'antd'
import {
  ApartmentOutlined,
  BranchesOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  UnorderedListOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import RuntimeManagerSwitch from '../../components/ManagerSwitch/RuntimeManagerSwitch'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './Gradle.module.css'

const GRADLE_CONFIGURATION_OPTIONS = [
  { value: 'implementation', label: 'implementation' },
  { value: 'api', label: 'api' },
  { value: 'compileOnly', label: 'compileOnly' },
  { value: 'runtimeOnly', label: 'runtimeOnly' },
  { value: 'testImplementation', label: 'testImplementation' },
  { value: 'testRuntimeOnly', label: 'testRuntimeOnly' },
  { value: 'annotationProcessor', label: 'annotationProcessor' }
]

const GRADLE_TASK_OPTIONS = [
  { value: 'tasks --all', label: 'gradle tasks --all' },
  { value: 'build', label: 'gradle build' },
  { value: 'test', label: 'gradle test' },
  { value: 'clean build', label: 'gradle clean build' },
  { value: 'dependencies', label: 'gradle dependencies' },
  { value: 'dependencies --configuration runtimeClasspath', label: 'gradle dependencies --configuration runtimeClasspath' }
]

const configurationColor = (configuration: string) => {
  if (configuration.toLowerCase().includes('test')) return 'geekblue'
  if (configuration.toLowerCase().includes('runtime')) return 'purple'
  if (configuration.toLowerCase().includes('compile')) return 'cyan'
  return 'green'
}

const GradlePage: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [buildInfo, setBuildInfo] = useState<{ hasGradleBuild: boolean; path: string } | null>(null)
  const [dependencies, setDependencies] = useState<GradleDependencyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [commandVisible, setCommandVisible] = useState(false)
  const [outputVisible, setOutputVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [healthVisible, setHealthVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')
  const [selectedDependency, setSelectedDependency] = useState<GradleDependencyInfo | null>(null)
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; item?: GradleSearchResult }>>([])
  const [versionOptions, setVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [dependencyForm] = Form.useForm()
  const [commandForm] = Form.useForm()

  const dependencyStats = useMemo(() => {
    const configurations = new Set(dependencies.map((item) => item.configuration))
    const testDeps = dependencies.filter((item) => item.configuration.toLowerCase().includes('test')).length
    const runtimeDeps = dependencies.filter((item) => item.configuration.toLowerCase().includes('runtime')).length

    return [
      { label: '构建文件', value: buildInfo?.hasGradleBuild ? buildInfo.path.split(/[\\/]/).pop() || 'build.gradle' : '未检测到' },
      { label: '依赖数', value: String(dependencies.length) },
      { label: '配置数', value: String(configurations.size) },
      { label: '测试', value: String(testDeps) },
      { label: '运行时', value: String(runtimeDeps) }
    ]
  }, [dependencies, buildInfo?.hasGradleBuild, buildInfo?.path])

  const dependencyColumns = useMemo<any[]>(() => [
    {
      title: 'Group',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 240,
      ellipsis: true
    },
    {
      title: 'Artifact',
      dataIndex: 'artifactId',
      key: 'artifactId',
      width: 220,
      render: (text: string) => <Tag color="green">{text}</Tag>
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 150,
      render: (text: string) => text || '-'
    },
    {
      title: '配置',
      dataIndex: 'configuration',
      key: 'configuration',
      width: 180,
      render: (text: string) => <Tag color={configurationColor(text)}>{text}</Tag>
    },
    {
      title: '操作',
      key: 'actions',
      width: 390,
      render: (_: unknown, record: GradleDependencyInfo) => (
        <Space wrap size={6}>
          <Button size="small" onClick={() => showDependencyVersions(record)}>版本</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={() => updateDependency(record)}>更新</Button>
          <Button size="small" icon={<SearchOutlined />} onClick={() => showDependencyInsight(record)}>Insight</Button>
          <Tooltip title="打开 Maven Central">
            <Button size="small" icon={<ExportOutlined />} onClick={() => openMavenCentral(record)} />
          </Tooltip>
          <Popconfirm
            title="确认移除此依赖？"
            okText="移除"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeDependency(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ], [])

  useEffect(() => {
    void loadGradleProject()
  }, [currentPath])

  useDependencyHealthReminder('gradle', currentPath, !!currentPath && !!buildInfo?.hasGradleBuild)

  const chooseDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setCurrentPath(path)
    addNotification({ type: 'info', message: '工作目录已切换', description: path })
  }

  const loadGradleProject = async () => {
    if (!currentPath) {
      setBuildInfo(null)
      setDependencies([])
      return
    }

    setLoading(true)
    try {
      const detected = await window.electronAPI.gradle.detect(currentPath)
      setBuildInfo(detected)
      if (!detected.hasGradleBuild) {
        setDependencies([])
        return
      }
      setDependencies(await window.electronAPI.gradle.list(currentPath))
    } catch (error: any) {
      setDependencies([])
      addNotification({ type: 'error', message: '加载 Gradle 项目失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openBuildFile = async () => {
    if (!buildInfo?.hasGradleBuild) return
    try {
      await window.electronAPI.system.openFile(buildInfo.path)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 Gradle 构建文件失败', description: error.message })
    }
  }

  const openDependencyModal = () => {
    dependencyForm.resetFields()
    dependencyForm.setFieldsValue({ configuration: 'implementation' })
    setSearchOptions([])
    setVersionOptions([])
    setInstallVisible(true)
  }

  const searchDependencies = async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchOptions([])
      return
    }

    try {
      const result = await window.electronAPI.gradle.search(normalized, {
        mode: 'startsWith',
        scope: 'artifactId',
        source: 'mavenCentral'
      })
      setSearchOptions(result.map((item) => ({
        value: `${item.groupId}:${item.artifactId}`,
        label: `${item.groupId}:${item.artifactId}${item.latestVersion ? ` (${item.latestVersion})` : ''}${item.description ? ` - ${item.description}` : ''}`,
        item
      })))
    } catch {
      setSearchOptions([])
    }
  }

  const selectDependency = (_: string, option: any) => {
    const item = option.item as GradleSearchResult | undefined
    if (!item) return
    dependencyForm.setFieldsValue({
      groupId: item.groupId,
      artifactId: item.artifactId,
      version: item.latestVersion || item.version,
      configuration: item.configuration || 'implementation'
    })
    const version = item.latestVersion || item.version
    setVersionOptions(version ? [{ value: version, label: version }] : [])
  }

  const loadDependencyVersions = async () => {
    const values = dependencyForm.getFieldsValue()
    if (!values.groupId || !values.artifactId) return

    try {
      const versions = await window.electronAPI.gradle.versions(values.groupId, values.artifactId)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length === 0) {
        addNotification({ type: 'info', message: '未返回版本信息', description: `${values.groupId}:${values.artifactId}` })
      }
    } catch (error: any) {
      setVersionOptions([])
      addNotification({ type: 'error', message: '加载 Gradle 版本失败', description: error.message })
    }
  }

  const addDependency = async (values: GradleDependencyInfo) => {
    if (!currentPath) {
      addNotification({ type: 'warning', message: '请先选择 Gradle 项目目录' })
      return
    }

    setLoading(true)
    try {
      await window.electronAPI.gradle.addDependency({
        cwd: currentPath,
        groupId: values.groupId,
        artifactId: values.artifactId,
        version: values.version,
        configuration: values.configuration || 'implementation'
      })
      setInstallVisible(false)
      dependencyForm.resetFields()
      await loadGradleProject()
      addNotification({ type: 'success', message: 'Gradle 依赖已保存', description: `${values.groupId}:${values.artifactId}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 Gradle 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateDependency = async (record: GradleDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const versions = await window.electronAPI.gradle.versions(record.groupId, record.artifactId)
      const targetVersion = versions[0] || record.version
      await window.electronAPI.gradle.updateDependency({
        cwd: currentPath,
        groupId: record.groupId,
        artifactId: record.artifactId,
        version: targetVersion,
        configuration: record.configuration || 'implementation'
      })
      await loadGradleProject()
      addNotification({ type: 'success', message: 'Gradle 依赖已更新', description: `${record.artifactId}@${targetVersion}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Gradle 更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const updateAllDependencies = async () => {
    if (!currentPath || dependencies.length === 0) return
    setLoading(true)
    const updated: string[] = []
    const skipped: string[] = []

    try {
      for (const dependency of dependencies) {
        const versions = await window.electronAPI.gradle.versions(dependency.groupId, dependency.artifactId)
        const targetVersion = versions[0]
        if (!targetVersion || targetVersion === dependency.version) {
          skipped.push(`${dependency.groupId}:${dependency.artifactId}`)
          continue
        }
        await window.electronAPI.gradle.updateDependency({
          cwd: currentPath,
          groupId: dependency.groupId,
          artifactId: dependency.artifactId,
          version: targetVersion,
          configuration: dependency.configuration || 'implementation'
        })
        updated.push(`${dependency.groupId}:${dependency.artifactId} ${dependency.version} -> ${targetVersion}`)
      }
      await loadGradleProject()
      setOutputTitle('Gradle 更新全部')
      setOutput([
        `已更新: ${updated.length}`,
        `已跳过: ${skipped.length}`,
        '',
        ...updated,
        skipped.length ? `\n已跳过:\n${skipped.join('\n')}` : ''
      ].filter(Boolean).join('\n'))
      setOutputVisible(true)
      addNotification({ type: 'success', message: 'Gradle 全量更新完成', description: `已更新 ${updated.length}，已跳过 ${skipped.length}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Gradle 全量更新失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const removeDependency = async (record: GradleDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      await window.electronAPI.gradle.removeDependency({
        cwd: currentPath,
        groupId: record.groupId,
        artifactId: record.artifactId,
        configuration: record.configuration
      })
      await loadGradleProject()
      addNotification({ type: 'success', message: 'Gradle 依赖已移除', description: record.artifactId })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Gradle 依赖失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyVersions = async (record: GradleDependencyInfo) => {
    setSelectedDependency(record)
    setVersionOptions([])
    setVersionVisible(true)
    setLoading(true)
    try {
      const versions = await window.electronAPI.gradle.versions(record.groupId, record.artifactId)
      setVersionOptions(versions.map((version) => ({ value: version, label: version })))
    } catch (error: any) {
      addNotification({ type: 'error', message: '加载 Gradle 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const installSelectedVersion = async (version: string) => {
    if (!currentPath || !selectedDependency) return
    setLoading(true)
    try {
      await window.electronAPI.gradle.updateDependency({
        cwd: currentPath,
        groupId: selectedDependency.groupId,
        artifactId: selectedDependency.artifactId,
        version,
        configuration: selectedDependency.configuration || 'implementation'
      })
      setVersionVisible(false)
      await loadGradleProject()
      addNotification({ type: 'success', message: 'Gradle 版本已切换', description: `${selectedDependency.artifactId}@${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: '切换 Gradle 版本失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyInsight = async (record: GradleDependencyInfo) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.gradle.dependencyInsight(currentPath, record.artifactId, record.configuration)
      setOutputTitle(`Gradle insight: ${record.groupId}:${record.artifactId}`)
      setOutput(result || '没有 dependency insight 输出')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Gradle dependency insight 失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openCommandModal = () => {
    commandForm.setFieldsValue({ command: 'tasks --all' })
    setCommandVisible(true)
  }

  const runCommand = async (values: { command: string }) => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.gradle.runTask(currentPath, values.command)
      setOutputTitle(`gradle ${values.command}`)
      setOutput(result || '已完成')
      setOutputVisible(true)
      setCommandVisible(false)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Gradle 命令执行失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showTasks = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.gradle.tasks(currentPath)
      setOutputTitle('gradle tasks --all')
      setOutput(result || '没有任务输出')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '读取 Gradle tasks 失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showDependencyTree = async () => {
    if (!currentPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.gradle.dependencyTree(currentPath, 'runtimeClasspath')
      setOutputTitle('gradle dependencies --configuration runtimeClasspath')
      setOutput(result || '没有依赖树输出')
      setOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 Gradle 依赖树失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const openMavenCentral = async (record: GradleDependencyInfo) => {
    const version = record.version || 'latest'
    const url = `https://search.maven.org/artifact/${encodeURIComponent(record.groupId)}/${encodeURIComponent(record.artifactId)}/${encodeURIComponent(version)}/jar`
    try {
      await window.electronAPI.openExternal(url)
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 Maven Central 失败', description: error.message })
    }
  }

  const hasGradleBuild = !!buildInfo?.hasGradleBuild
  const actionsDisabled = !currentPath || !hasGradleBuild

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>Gradle 管理</h2>
            <div className={styles.subtitle}>管理 Gradle 依赖、Maven Central 版本、任务、依赖树与 dependency insight。</div>
          </div>
          <RuntimeManagerSwitch active="gradle" />
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
        <Alert type="info" showIcon title="选择 Gradle 项目目录以加载 build.gradle 依赖。" />
      )}
      {currentPath && buildInfo && !buildInfo.hasGradleBuild && (
        <Alert
          type="warning"
          showIcon
          title="所选目录未检测到 Gradle 构建文件。"
          description="添加或更新依赖前，请选择 Gradle 项目根目录。"
        />
      )}

      <div className={styles.workspace}>
        <div className={styles.sectionHeader}>
          <Space>
            <ApartmentOutlined />
            <strong>项目依赖</strong>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadGradleProject} loading={loading} disabled={!currentPath}>刷新</Button>
            <Button icon={<FileTextOutlined />} onClick={openBuildFile} disabled={!hasGradleBuild}>打开构建文件</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openDependencyModal} disabled={actionsDisabled}>添加依赖</Button>
            <Button icon={<SyncOutlined />} onClick={updateAllDependencies} loading={loading} disabled={actionsDisabled || dependencies.length === 0}>更新全部</Button>
            <Button icon={<PlayCircleOutlined />} onClick={openCommandModal} disabled={actionsDisabled}>运行</Button>
            <Button icon={<UnorderedListOutlined />} onClick={showTasks} loading={loading} disabled={actionsDisabled}>Tasks</Button>
            <Button icon={<BranchesOutlined />} onClick={showDependencyTree} loading={loading} disabled={actionsDisabled}>依赖树</Button>
            <Button icon={<WarningOutlined />} onClick={() => setHealthVisible(true)} disabled={actionsDisabled}>依赖诊断</Button>
          </Space>
        </div>

        {hasGradleBuild && (
          <Descriptions bordered size="small" column={1} className={styles.manifestInfo}>
            <Descriptions.Item label="构建文件">{buildInfo?.path}</Descriptions.Item>
          </Descriptions>
        )}

        <Spin spinning={loading}>
          {dependencies.length === 0 ? (
            <Empty description={hasGradleBuild ? '无 Gradle 依赖' : '未加载 Gradle 项目'} />
          ) : (
            <Table
              dataSource={dependencies}
              columns={dependencyColumns}
              rowKey={(record) => `${record.configuration}:${record.groupId}:${record.artifactId}`}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 1180 }}
            />
          )}
        </Spin>
      </div>

      <Modal
        title="添加 Gradle 依赖"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => dependencyForm.submit()}
        okText="保存"
      forceRender
      >
        <Form form={dependencyForm} layout="vertical" onFinish={addDependency}>
          <Form.Item name="groupId" label="GroupId" rules={[{ required: true, message: '请输入 groupId' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchDependencies}
              onSelect={selectDependency}
              placeholder="org.springframework"
            />
          </Form.Item>
          <Form.Item name="artifactId" label="ArtifactId" rules={[{ required: true, message: '请输入 artifactId' }]}>
            <AutoComplete
              options={searchOptions}
              onSearch={searchDependencies}
              onSelect={selectDependency}
              placeholder="spring-core"
            />
          </Form.Item>
          <Form.Item label="版本" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle rules={[{ required: true, message: '请输入版本' }]}>
                <AutoComplete options={versionOptions} placeholder="6.1.0" style={{ width: '100%' }} />
              </Form.Item>
              <Button onClick={loadDependencyVersions}>版本</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="configuration" label="配置">
            <AutoComplete options={GRADLE_CONFIGURATION_OPTIONS} placeholder="implementation" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="运行 Gradle 任务"
        open={commandVisible}
        onCancel={() => setCommandVisible(false)}
        onOk={() => commandForm.submit()}
        okText="运行"
      forceRender
      >
        <Form form={commandForm} layout="vertical" onFinish={runCommand}>
          <Form.Item name="command" label="任务或参数" rules={[{ required: true, message: '请输入 Gradle 任务' }]}>
            <AutoComplete options={GRADLE_TASK_OPTIONS} placeholder="tasks --all" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`版本 - ${selectedDependency?.artifactId || ''}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={620}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="green">{selectedDependency?.version || '-'}</Tag></span>
          <div className={styles.versions}>
            {versionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              versionOptions.map((item) => (
                <Tag
                  key={item.value}
                  color={item.value === selectedDependency?.version ? 'green' : 'default'}
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

      <DependencyHealthModal
        visible={healthVisible}
        manager="gradle"
        cwd={currentPath}
        onClose={() => setHealthVisible(false)}
      />
    </div>
  )
}

export default GradlePage
