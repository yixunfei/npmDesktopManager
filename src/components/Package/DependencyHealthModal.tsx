import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Modal, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd'
import { CopyOutlined, FileTextOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'

const { Paragraph, Text } = Typography

interface DependencyHealthModalProps {
  visible: boolean
  manager: DependencyHealthManager
  cwd: string
  onClose: () => void
  onScanned?: (result: DependencyHealthScanResult) => void
}

const severityColor: Record<DependencyHealthSeverity, string> = {
  critical: 'red',
  high: 'red',
  medium: 'orange',
  low: 'blue',
  info: 'default'
}

const typeLabel: Record<DependencyHealthIssueType, string> = {
  cycle: '循环依赖',
  'version-conflict': '多版本/冲突',
  'peer-conflict': 'Peer 冲突',
  missing: '缺失依赖',
  invalid: '无效依赖',
  extraneous: '多余依赖',
  tooling: '工具问题',
  'native-linkage': '链接方式',
  unmanaged: '未托管依赖',
  configuration: '配置提醒'
}

export const DependencyHealthModal: React.FC<DependencyHealthModalProps> = ({
  visible,
  manager,
  cwd,
  onClose,
  onScanned
}) => {
  const addNotification = useAppStore((state) => state.addNotification)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DependencyHealthScanResult | null>(null)
  const [actionRunning, setActionRunning] = useState('')
  const [outputVisible, setOutputVisible] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [output, setOutput] = useState('')

  const scan = async () => {
    if (!cwd) return
    setLoading(true)
    try {
      const nextResult = await window.electronAPI.dependencyHealth.scan(manager, cwd)
      setResult(nextResult)
      onScanned?.(nextResult)
      addNotification({
        type: nextResult.summary.total > 0 ? 'warning' : 'success',
        message: nextResult.summary.total > 0 ? '依赖诊断完成' : '未发现依赖问题',
        description: nextResult.summary.total > 0 ? `${manager} 发现 ${nextResult.summary.total} 项提醒` : manager
      })
    } catch (error: any) {
      addNotification({ type: 'error', message: '依赖诊断失败', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      void scan()
    }
  }, [visible, manager, cwd])

  const summaryText = useMemo(() => {
    if (!result) return ''
    const { summary } = result
    if (summary.total === 0) return '当前依赖树没有发现循环依赖、冲突或重复版本提醒。'
    return [
      `共 ${summary.total} 项`,
      summary.critical ? `Critical ${summary.critical}` : '',
      summary.high ? `High ${summary.high}` : '',
      summary.medium ? `Medium ${summary.medium}` : '',
      summary.low ? `Low ${summary.low}` : ''
    ].filter(Boolean).join(' / ')
  }, [result])

  const runAction = async (issue: DependencyHealthIssue, action: DependencyHealthAction) => {
    if (action.kind === 'copy') {
      await navigator.clipboard.writeText(action.payload || issue.suggestion)
      addNotification({ type: 'success', message: '修复建议已复制', description: issue.dependency || issue.title })
      return
    }

    if (action.kind === 'openFile' && action.target) {
      await window.electronAPI.system.openFile(action.target)
      return
    }

    if (action.kind !== 'command' && action.kind !== 'api') {
      addNotification({ type: 'info', message: '请按建议手动处理', description: issue.suggestion })
      return
    }

    const actionKey = `${issue.id}:${action.id}`
    setActionRunning(actionKey)
    try {
      const actionOutput = await window.electronAPI.dependencyHealth.fix(cwd, action)
      setOutputTitle(action.label)
      setOutput(actionOutput || '操作完成')
      setOutputVisible(true)
      addNotification({ type: 'success', message: '诊断操作完成', description: action.label })
      await scan()
    } catch (error: any) {
      addNotification({ type: 'error', message: '诊断操作失败', description: error.message })
    } finally {
      setActionRunning('')
    }
  }

  const columns = [
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: DependencyHealthSeverity) => <Tag color={severityColor[severity]}>{severity.toUpperCase()}</Tag>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (type: DependencyHealthIssueType) => <Tag>{typeLabel[type] || type}</Tag>
    },
    {
      title: '依赖',
      dataIndex: 'dependency',
      key: 'dependency',
      width: 220,
      ellipsis: true,
      render: (text: string) => text ? <Text code>{text}</Text> : '-'
    },
    {
      title: '说明与建议',
      key: 'description',
      render: (_: unknown, issue: DependencyHealthIssue) => (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <strong>{issue.title}</strong>
          <Text type="secondary">{issue.description}</Text>
          <Text>{issue.suggestion}</Text>
          {issue.paths?.length ? (
            <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
              {issue.paths.join('\n')}
            </Paragraph>
          ) : null}
        </Space>
      )
    },
    {
      title: '便捷处理',
      key: 'actions',
      width: 230,
      render: (_: unknown, issue: DependencyHealthIssue) => (
        <Space wrap size={6}>
          {issue.actions.slice(0, 3).map((action) => {
            const key = `${issue.id}:${action.id}`
            const icon = action.kind === 'copy'
              ? <CopyOutlined />
              : action.kind === 'openFile'
                ? <FileTextOutlined />
                : <PlayCircleOutlined />
            return (
              <Tooltip key={action.id} title={action.description || action.payload || action.target || action.label}>
                <Button
                  size="small"
                  icon={icon}
                  loading={actionRunning === key}
                  onClick={() => runAction(issue, action)}
                >
                  {action.label}
                </Button>
              </Tooltip>
            )
          })}
        </Space>
      )
    }
  ]

  return (
    <>
      <Modal
        title={`${manager} 依赖诊断`}
        open={visible}
        onCancel={onClose}
        footer={null}
        width={1120}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type={result?.summary.total ? 'warning' : 'info'}
            showIcon
            message={summaryText || '正在检查依赖树'}
            description="自动检查循环依赖、版本冲突、缺失/无效依赖、重复版本，以及 C/C++ 动态/静态链接混用等常见问题；修复按钮会先运行包管理器命令或打开相关文件。"
            action={<Button icon={<ReloadOutlined />} onClick={scan} loading={loading}>重新扫描</Button>}
          />
          <Spin spinning={loading}>
            {!result || result.issues.length === 0 ? (
              <Empty description={loading ? '正在扫描依赖问题' : '暂无依赖诊断提醒'} />
            ) : (
              <Table
                dataSource={result.issues}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 8 }}
                scroll={{ x: 1040 }}
              />
            )}
          </Spin>
        </Space>
      </Modal>

      <Modal
        title={outputTitle}
        open={outputVisible}
        onCancel={() => setOutputVisible(false)}
        footer={null}
        width={900}
      >
        <pre style={{
          maxHeight: 520,
          overflow: 'auto',
          margin: 0,
          padding: 16,
          borderRadius: 8,
          background: 'var(--bg-tertiary, #1e1e1e)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {output}
        </pre>
      </Modal>
    </>
  )
}
