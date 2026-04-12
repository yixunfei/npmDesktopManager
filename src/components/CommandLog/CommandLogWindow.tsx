import React, { useEffect, useRef, useState } from 'react'
import { Button, Card, Tag, Typography, Space, Empty, Tooltip } from 'antd'
import { ConsoleSqlOutlined, ClearOutlined, DownOutlined, UpOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import { useCommandLogStore, CommandLogEntry } from '../../stores/commandLogStore'
import styles from './CommandLogWindow.module.css'

const { Text } = Typography

const CommandLogWindow: React.FC = () => {
  const { logs, visible, toggleVisible, clearLogs } = useCommandLogStore()
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  useEffect(() => {
    const { addLog } = useCommandLogStore.getState()
    let isMounted = true
    
    const handleCommandLog = (data: CommandLogEntry) => {
      if (!isMounted) return
      
      try {
        addLog(data.command, data.status, data.output, data.error, data.id)
      } catch (e) {
      }
    }
    
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        window.electronAPI.onCommandLog(handleCommandLog)
      } catch (e) {
      }
    }

    return () => {
      isMounted = false
      if (typeof window !== 'undefined' && window.electronAPI) {
        try {
          window.electronAPI.removeCommandLogListener()
        } catch (e) {
        }
      }
    }
  }, [])

  useEffect(() => {
    if (visible && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, visible])

  const toggleLogExpansion = (id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAllExpansion = () => {
    if (allExpanded) {
      setExpandedLogs(new Set())
    } else {
      const allIds = new Set(logs.map(log => log.id))
      setExpandedLogs(allIds)
    }
    setAllExpanded(!allExpanded)
  }

  const isExpanded = (id: string) => {
    return expandedLogs.has(id)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'processing'
      case 'success':
        return 'success'
      case 'error':
        return 'error'
      default:
        return 'default'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running':
        return '执行中'
      case 'success':
        return '成功'
      case 'error':
        return '失败'
      default:
        return '未知'
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const hasOutput = (log: CommandLogEntry) => {
    return !!(log.output || log.error)
  }

  return (
    <>
      <div className={styles.toggleButton}>
        <Space>
          <Button
            type={visible ? 'primary' : 'default'}
            icon={visible ? <DownOutlined /> : <ConsoleSqlOutlined />}
            onClick={toggleVisible}
          >
            {visible ? '隐藏终端' : '终端'}
            {logs.length > 0 && (
              <Tag color={logs.some(l => l.status === 'error') ? 'error' : logs.some(l => l.status === 'running') ? 'processing' : 'success'} style={{ marginLeft: 8 }}>
                {logs.length}
              </Tag>
            )}
          </Button>
        </Space>
      </div>

      {visible && (
        <div className={`${styles.container} ${isMaximized ? styles.maximized : ''}`}>
          <Card
            size="small"
            title={
              <Space>
                <ConsoleSqlOutlined />
                <span>命令执行终端</span>
                <Tag color={logs.some(l => l.status === 'error') ? 'error' : logs.some(l => l.status === 'running') ? 'processing' : 'success'}>
                  {logs.filter(l => l.status === 'running').length > 0 ? '运行中' : '就绪'}
                </Tag>
              </Space>
            }
            extra={
              <Space>
                <Tooltip title={allExpanded ? '全部折叠' : '全部展开'}>
                  <Button
                    type="text"
                    size="small"
                    icon={allExpanded ? <UpOutlined /> : <DownOutlined />}
                    onClick={toggleAllExpansion}
                  >
                    {allExpanded ? '全部折叠' : '全部展开'}
                  </Button>
                </Tooltip>
                <Tooltip title={isMaximized ? '还原' : '最大化'}>
                  <Button
                    type="text"
                    size="small"
                    icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setIsMaximized(!isMaximized)}
                  />
                </Tooltip>
                <Tooltip title="清空日志">
                  <Button
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={clearLogs}
                  >
                    清空
                  </Button>
                </Tooltip>
              </Space>
            }
            className={styles.card}
          >
            <div className={styles.logsContainer}>
              {logs.length === 0 ? (
                <div className={styles.emptyState}>
                  <Empty
                    description="暂无命令执行记录"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              ) : (
                <div className={styles.logsList}>
                  {logs.map((log) => (
                    <div key={log.id} className={styles.logEntry}>
                      <div className={styles.logHeader}>
                        <Space>
                          <Text type="secondary" className={styles.time}>
                            {formatTime(log.timestamp)}
                          </Text>
                          <Tag color={getStatusColor(log.status)}>
                            {getStatusText(log.status)}
                          </Tag>
                        </Space>
                        {hasOutput(log) && (
                          <Button
                            type="text"
                            size="small"
                            icon={isExpanded(log.id) ? <UpOutlined /> : <DownOutlined />}
                            onClick={() => toggleLogExpansion(log.id)}
                          />
                        )}
                      </div>
                      <div className={styles.command}>
                        <Text code className={styles.commandText}>{log.command}</Text>
                      </div>
                      {hasOutput(log) && isExpanded(log.id) && (
                        <div className={styles.output}>
                          {log.output && (
                            <div className={styles.outputSection}>
                              <div className={styles.outputLabel}>stdout:</div>
                              <pre className={styles.stdout}>{log.output}</pre>
                            </div>
                          )}
                          {log.error && (
                            <div className={styles.outputSection}>
                              <div className={styles.outputLabel}>stderr:</div>
                              <pre className={styles.stderr}>{log.error}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

export default CommandLogWindow
