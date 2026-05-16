import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, FolderOpenOutlined, ReloadOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'

const toolLabels: Record<ToolName, string> = {
  npm: 'npm / Node.js',
  pip: 'pip / Python',
  maven: 'Maven'
}

const ToolchainStatusModal: React.FC = () => {
  const [statuses, setStatuses] = useState<ToolStatus[]>([])
  const [paths, setPaths] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkTools()
  }, [])

  const unavailable = useMemo(() => statuses.filter((item) => !item.available), [statuses])

  const checkTools = async () => {
    if (!window.electronAPI?.system?.checkTools) return
    setLoading(true)
    try {
      const result = await window.electronAPI.system.checkTools()
      setStatuses(result)
      setPaths(Object.fromEntries(result.map((item) => [item.tool, item.configuredPath || ''])))
      setVisible(result.some((item) => !item.available))
    } finally {
      setLoading(false)
    }
  }

  const savePath = async (tool: ToolName) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.system.setToolPath(tool, paths[tool] || '')
      setStatuses(result)
      setVisible(result.some((item) => !item.available))
    } finally {
      setLoading(false)
    }
  }

  const chooseDirectory = async (tool: ToolName) => {
    const directory = await window.electronAPI.selectDirectory()
    if (!directory) return
    setPaths((prev) => ({ ...prev, [tool]: directory }))
    setLoading(true)
    try {
      const result = await window.electronAPI.system.setToolPath(tool, directory)
      setStatuses(result)
      setVisible(result.some((item) => !item.available))
    } finally {
      setLoading(false)
    }
  }

  if (statuses.length === 0) return null

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          基础命令配置
        </Space>
      }
      open={visible && unavailable.length > 0}
      onCancel={() => setVisible(false)}
      footer={
        <Space>
          <Button onClick={() => setVisible(false)}>稍后处理</Button>
          <Button icon={<ReloadOutlined />} onClick={checkTools} loading={loading}>重新检测</Button>
        </Space>
      }
      width={840}
    >
      <Alert
        type="warning"
        showIcon
        title={`检测到 ${unavailable.map((item) => toolLabels[item.tool]).join('、')} 不可用`}
        description="请选择命令所在目录，系统会自动查找对应可执行文件；也可以打开官方下载页面安装后重新检测。"
        style={{ marginBottom: 16 }}
      />
      <Table
        dataSource={unavailable}
        rowKey="tool"
        size="small"
        pagination={false}
        columns={[
          {
            title: '工具',
            dataIndex: 'tool',
            key: 'tool',
            width: 130,
            render: (tool: ToolName) => toolLabels[tool]
          },
          {
            title: '状态',
            key: 'status',
            width: 130,
            render: (_: any, record: ToolStatus) => (
              record.available
                ? <Tag color="green">{record.version || '可用'}</Tag>
                : <Tooltip title={record.message}><Tag color="red">不可用</Tag></Tooltip>
            )
          },
          {
            title: '命令所在目录',
            key: 'path',
            render: (_: any, record: ToolStatus) => (
              <Input
                value={paths[record.tool] || ''}
                onChange={(event) => setPaths((prev) => ({ ...prev, [record.tool]: event.target.value }))}
                placeholder={record.tool === 'maven' ? '例如: C:\\apache-maven\\bin' : '例如: C:\\Program Files\\nodejs'}
              />
            )
          },
          {
            title: '操作',
            key: 'action',
            width: 260,
            render: (_: any, record: ToolStatus) => (
              <Space>
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => chooseDirectory(record.tool)} loading={loading}>
                  选择目录
                </Button>
                <Button size="small" icon={<SaveOutlined />} onClick={() => savePath(record.tool)} loading={loading}>
                  保存
                </Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => window.electronAPI.system.openToolDownload(record.tool)}>
                  下载
                </Button>
              </Space>
            )
          }
        ]}
      />
    </Modal>
  )
}

export default ToolchainStatusModal
