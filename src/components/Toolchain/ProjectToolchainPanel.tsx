import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'

const { Text } = Typography

const toolLabels: Record<ToolName, string> = {
  npm: 'npm',
  pip: 'pip / Python',
  maven: 'Maven',
  cargo: 'Cargo / Rust',
  gradle: 'Gradle',
  go: 'Go',
  flutter: 'Flutter',
  cmake: 'CMake',
  vcpkg: 'vcpkg',
  conan: 'Conan'
}

const toolPlaceholders: Partial<Record<ToolName, string>> = {
  npm: '例如: C:\\Program Files\\nodejs 或 npm.cmd',
  pip: '例如: D:\\env\\python3 或 python.exe',
  maven: '例如: C:\\apache-maven-3.8.8 或 mvn.cmd',
  cargo: '例如: C:\\Users\\you\\.cargo\\bin 或 cargo.exe',
  gradle: '例如: C:\\gradle-8.7 或 gradle.bat',
  go: '例如: C:\\Program Files\\Go 或 go.exe'
}

toolPlaceholders.cmake = 'Example: C:\\Program Files\\CMake\\bin or cmake.exe'
toolPlaceholders.flutter = 'Example: C:\\src\\flutter\\bin or flutter.bat'
toolPlaceholders.vcpkg = 'Example: C:\\vcpkg or vcpkg.exe'
toolPlaceholders.conan = 'Example: C:\\Python\\Scripts or conan.exe'

const tools: ToolName[] = ['npm', 'pip', 'maven', 'cargo', 'gradle', 'go', 'flutter', 'cmake', 'vcpkg', 'conan']
const emptyPaths = Object.fromEntries(tools.map((tool) => [tool, ''])) as Record<ToolName, string>

function pathsFromConfig(config: ToolchainConfig): Record<ToolName, string> {
  return {
    ...emptyPaths,
    ...Object.fromEntries(tools.map((tool) => [tool, config[tool] || '']))
  } as Record<ToolName, string>
}

interface ProjectToolchainPanelProps {
  projectPath: string
  compact?: boolean
}

const ProjectToolchainPanel: React.FC<ProjectToolchainPanelProps> = ({ projectPath, compact = false }) => {
  const [statuses, setStatuses] = useState<ToolStatus[]>([])
  const [paths, setPaths] = useState<Record<ToolName, string>>(emptyPaths)
  const [loading, setLoading] = useState(false)

  const statusMap = useMemo(() => {
    return Object.fromEntries(statuses.map((status) => [status.tool, status])) as Record<ToolName, ToolStatus>
  }, [statuses])

  useEffect(() => {
    if (projectPath) {
      loadProjectToolchain()
    }
  }, [projectPath])

  const loadProjectToolchain = async () => {
    if (!projectPath) return
    setLoading(true)
    try {
      const [config, result] = await Promise.all([
        window.electronAPI.project.toolchain.get(projectPath),
        window.electronAPI.project.toolchain.check(projectPath)
      ])
      setPaths(pathsFromConfig(config))
      setStatuses(result)
    } finally {
      setLoading(false)
    }
  }

  const chooseDirectory = async (tool: ToolName) => {
    const directory = await window.electronAPI.selectDirectory()
    if (!directory) return
    setPaths((prev) => ({ ...prev, [tool]: directory }))
    await savePath(tool, directory)
  }

  const savePath = async (tool: ToolName, explicitPath?: string) => {
    if (!projectPath) return
    setLoading(true)
    try {
      await window.electronAPI.project.toolchain.set(projectPath, tool, explicitPath ?? paths[tool] ?? '')
      await loadProjectToolchain()
    } finally {
      setLoading(false)
    }
  }

  const clearPath = async (tool: ToolName) => {
    if (!projectPath) return
    setLoading(true)
    try {
      await window.electronAPI.project.toolchain.clear(projectPath, tool)
      await loadProjectToolchain()
    } finally {
      setLoading(false)
    }
  }

  if (!projectPath) {
    return (
      <Alert
        type="info"
        showIcon
        title="选择项目目录后可为该项目单独绑定 npm / pip / Maven 版本"
      />
    )
  }

  return (
    <Card
      size="small"
      title="项目工具版本"
      extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadProjectToolchain} loading={loading}>检测</Button>}
      style={{ marginBottom: compact ? 12 : 16 }}
    >
      <Text type="secondary">
        这里保存的是当前项目的工具版本覆盖。留空时使用全局配置或系统 PATH。
      </Text>
      <Table
        style={{ marginTop: 12 }}
        dataSource={tools.map((tool) => ({ tool }))}
        rowKey="tool"
        size="small"
        pagination={false}
        scroll={{ x: 980 }}
        columns={[
          {
            title: '工具',
            dataIndex: 'tool',
            key: 'tool',
            width: 130,
            render: (tool: ToolName) => toolLabels[tool]
          },
          {
            title: '项目绑定路径',
            key: 'path',
            width: 360,
            render: (_: any, record: { tool: ToolName }) => (
              <Input
                value={paths[record.tool]}
                onChange={(event) => setPaths((prev) => ({ ...prev, [record.tool]: event.target.value }))}
                placeholder={toolPlaceholders[record.tool]}
              />
            )
          },
          {
            title: '有效版本',
            key: 'status',
            width: 260,
            render: (_: any, record: { tool: ToolName }) => {
              const status = statusMap[record.tool]
              if (!status) return '-'
              return status.available ? (
                <Tooltip title={status.configuredPath || '系统 PATH'}>
                  <Tag color="green" style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
                    {status.version || '可用'}
                  </Tag>
                </Tooltip>
              ) : (
                <Tooltip title={status.message}>
                  <Tag color="red">不可用</Tag>
                </Tooltip>
              )
            }
          },
          {
            title: '操作',
            key: 'action',
            width: 250,
            render: (_: any, record: { tool: ToolName }) => (
              <Space>
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => chooseDirectory(record.tool)} loading={loading}>
                  选择
                </Button>
                <Button size="small" icon={<SaveOutlined />} onClick={() => savePath(record.tool)} loading={loading}>
                  保存
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => clearPath(record.tool)} loading={loading}>
                  清除
                </Button>
              </Space>
            )
          }
        ]}
      />
    </Card>
  )
}

export default ProjectToolchainPanel
