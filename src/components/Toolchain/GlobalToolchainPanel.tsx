import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, FolderOpenOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'

const { Text } = Typography

const toolLabels: Record<ToolName, string> = {
  npm: 'npm / Node.js',
  pip: 'pip / Python',
  maven: 'Maven'
}

const placeholders: Record<ToolName, string> = {
  npm: '例如: C:\\Program Files\\nodejs 或 npm.cmd',
  pip: '例如: D:\\env\\python3 或 python.exe',
  maven: '例如: C:\\apache-maven-3.8.8 或 mvn.cmd'
}

const tools: ToolName[] = ['npm', 'pip', 'maven']

const GlobalToolchainPanel: React.FC = () => {
  const [statuses, setStatuses] = useState<ToolStatus[]>([])
  const [paths, setPaths] = useState<Record<ToolName, string>>({ npm: '', pip: '', maven: '' })
  const [loading, setLoading] = useState(false)

  const statusMap = useMemo(() => {
    return Object.fromEntries(statuses.map((status) => [status.tool, status])) as Record<ToolName, ToolStatus>
  }, [statuses])

  useEffect(() => {
    loadTools()
  }, [])

  const loadTools = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.system.checkTools()
      setStatuses(result)
      setPaths({
        npm: result.find((item) => item.tool === 'npm')?.configuredPath || '',
        pip: result.find((item) => item.tool === 'pip')?.configuredPath || '',
        maven: result.find((item) => item.tool === 'maven')?.configuredPath || ''
      })
    } finally {
      setLoading(false)
    }
  }

  const savePath = async (tool: ToolName, explicitPath?: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.system.setToolPath(tool, explicitPath ?? paths[tool] ?? '')
      setStatuses(result)
      setPaths({
        npm: result.find((item) => item.tool === 'npm')?.configuredPath || '',
        pip: result.find((item) => item.tool === 'pip')?.configuredPath || '',
        maven: result.find((item) => item.tool === 'maven')?.configuredPath || ''
      })
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

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Alert
        type="info"
        showIcon
        title="全局工具版本"
        description="这里配置全局默认 npm / pip / Maven。项目页中的项目工具版本会优先覆盖这里的配置。"
      />
      <Table
        dataSource={tools.map((tool) => ({ tool }))}
        rowKey="tool"
        size="small"
        pagination={false}
        scroll={{ x: 1040 }}
        columns={[
          {
            title: '工具',
            dataIndex: 'tool',
            key: 'tool',
            width: 140,
            render: (tool: ToolName) => toolLabels[tool]
          },
          {
            title: '全局默认路径',
            key: 'path',
            width: 380,
            render: (_: any, record: { tool: ToolName }) => (
              <Input
                value={paths[record.tool]}
                onChange={(event) => setPaths((prev) => ({ ...prev, [record.tool]: event.target.value }))}
                placeholder={placeholders[record.tool]}
              />
            )
          },
          {
            title: '当前版本',
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
            width: 330,
            render: (_: any, record: { tool: ToolName }) => (
              <Space>
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => chooseDirectory(record.tool)} loading={loading}>
                  选择
                </Button>
                <Button size="small" icon={<SaveOutlined />} onClick={() => savePath(record.tool)} loading={loading}>
                  保存
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => savePath(record.tool, '')} loading={loading}>
                  清除
                </Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => window.electronAPI.system.openToolDownload(record.tool)}>
                  下载
                </Button>
              </Space>
            )
          }
        ]}
      />
      <Text type="secondary">可以填写工具目录，也可以直接填写可执行文件路径。</Text>
      <Button icon={<ReloadOutlined />} onClick={loadTools} loading={loading}>重新检测</Button>
    </Space>
  )
}

export default GlobalToolchainPanel
