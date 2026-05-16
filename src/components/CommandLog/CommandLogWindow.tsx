import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Empty, Input, Space, Tag, Tooltip, Typography } from 'antd'
import {
  ClearOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  DownOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SendOutlined,
  UpOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { useCommandLogStore, CommandLogEntry } from '../../stores/commandLogStore'
import { translateText, useTextT } from '../../i18n'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './CommandLogWindow.module.css'

const { Text } = Typography

const lineBreak = '\r\n'

const CommandLogWindow: React.FC = () => {
  const currentPath = useAppStore((state) => state.currentPath)
  const { logs, visible, toggleVisible, clearLogs, setVisible } = useCommandLogStore()
  const language = useSettingsStore((state) => state.language)
  const text = useTextT()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef<string>('')
  const [session, setSession] = useState<TerminalSessionInfo | null>(null)
  const [terminalBuffer, setTerminalBuffer] = useState('')
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [, setHistoryIndex] = useState(-1)
  const [isMaximized, setIsMaximized] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [logsCollapsed, setLogsCollapsed] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())

  const runningCount = useMemo(() => logs.filter((log) => log.status === 'running').length, [logs])
  const errorCount = useMemo(() => logs.filter((log) => log.status === 'error').length, [logs])

  useEffect(() => {
    const { addLog } = useCommandLogStore.getState()
    let isMounted = true

    const handleCommandLog = (data: CommandLogEntry) => {
      if (!isMounted) return
      addLog(data.command, data.status, data.output, data.error, data.id)
    }

    const handleTerminalData = (data: TerminalData) => {
      if (!isMounted || data.id !== terminalIdRef.current) return
      setTerminalBuffer((prev) => `${prev}${data.data}`)
    }

    const handleTerminalExit = (data: TerminalExitData) => {
      if (!isMounted || data.id !== terminalIdRef.current) return
      const currentLanguage = useSettingsStore.getState().language
      const exitCode = data.code ?? translateText(currentLanguage, '未知')
      const exitMessage = translateText(currentLanguage, `[进程已退出，退出码 ${exitCode}]`)
      setTerminalBuffer((prev) => `${prev}${lineBreak}${exitMessage}${lineBreak}`)
      terminalIdRef.current = ''
      setSession(null)
    }

    if (window.electronAPI) {
      window.electronAPI.onCommandLog(handleCommandLog)
      window.electronAPI.onTerminalData(handleTerminalData)
      window.electronAPI.onTerminalExit(handleTerminalExit)
    }

    return () => {
      isMounted = false
      if (window.electronAPI) {
        window.electronAPI.removeCommandLogListener()
        window.electronAPI.removeTerminalListeners()
      }
    }
  }, [])

  useEffect(() => {
    if (visible && !terminalIdRef.current) {
      startTerminal()
    }
  }, [visible])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalBuffer, visible])

  useEffect(() => {
    if (!visible || !terminalCollapsed || !logsCollapsed) return
    setVisible(false)
    setTerminalCollapsed(false)
    setLogsCollapsed(false)
  }, [visible, terminalCollapsed, logsCollapsed, setVisible])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, visible])

  useEffect(() => {
    return () => {
      if (terminalIdRef.current) {
        window.electronAPI?.terminal.kill(terminalIdRef.current)
      }
    }
  }, [])

  const startTerminal = async () => {
    try {
      if (terminalIdRef.current) {
        await window.electronAPI.terminal.kill(terminalIdRef.current)
      }
      const nextSession = await window.electronAPI.terminal.create(currentPath)
      terminalIdRef.current = nextSession.id
      setSession(nextSession)
      setTerminalBuffer('')
    } catch (error: any) {
      setTerminalBuffer((prev) => `${prev}${lineBreak}${error.message}${lineBreak}`)
    }
  }

  const sendCommand = async () => {
    const value = command.trim()
    if (!value || !terminalIdRef.current) return

    setTerminalBuffer((prev) => `${prev}${lineBreak}> ${value}${lineBreak}`)
    setHistory((prev) => [...prev.filter((item) => item !== value), value].slice(-50))
    setHistoryIndex(-1)
    setCommand('')

    try {
      await window.electronAPI.terminal.write(terminalIdRef.current, `${value}\n`)
    } catch (error: any) {
      setTerminalBuffer((prev) => `${prev}${error.message}${lineBreak}`)
    }
  }

  const handleCommandKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHistoryIndex((prev) => {
        const next = prev < 0 ? history.length - 1 : Math.max(0, prev - 1)
        setCommand(history[next] || '')
        return next
      })
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHistoryIndex((prev) => {
        if (prev < 0) return -1
        const next = prev + 1
        if (next >= history.length) {
          setCommand('')
          return -1
        }
        setCommand(history[next] || '')
        return next
      })
    }
  }

  const toggleLogExpansion = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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
        return text('执行中')
      case 'success':
        return text('成功')
      case 'error':
        return text('失败')
      default:
        return text('未知')
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const hasOutput = (log: CommandLogEntry) => !!(log.output || log.error)
  const promptText = `${session?.shell === 'PowerShell' ? 'PS ' : ''}${session?.cwd || currentPath || '~'}>`

  return (
    <>
      <div className={styles.toggleButton}>
        <Button
          type={visible ? 'primary' : 'default'}
          icon={visible ? <DownOutlined /> : <ConsoleSqlOutlined />}
          onClick={toggleVisible}
          className={!visible && errorCount > 0 ? styles.alertButton : undefined}
        >
          {visible ? text('隐藏终端') : text('终端')}
          {logs.length > 0 && (
            <Tag color={errorCount > 0 ? 'error' : runningCount > 0 ? 'processing' : 'success'} className={styles.toggleTag}>
              {runningCount > 0 ? `${runningCount} ${text('运行中')}` : logs.length}
            </Tag>
          )}
        </Button>
      </div>

      {visible && (
        <div className={`${styles.container} ${isMaximized ? styles.maximized : ''}`}>
          <Card
            size="small"
            title={
              <Space>
                <ConsoleSqlOutlined />
                <span>{text('交互终端')}</span>
                <Tag color={session ? 'processing' : 'default'}>{session ? session.shell : text('未连接')}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Tooltip title={text('重启终端会话')}>
                  <Button type="text" size="small" icon={<ReloadOutlined />} onClick={startTerminal} />
                </Tooltip>
                <Tooltip title={isMaximized ? text('还原') : text('最大化')}>
                  <Button
                    type="text"
                    size="small"
                    icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setIsMaximized(!isMaximized)}
                  />
                </Tooltip>
                <Tooltip title={text('清空终端输出')}>
                  <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => setTerminalBuffer('')} />
                </Tooltip>
                <Tooltip title={text('清空命令日志')}>
                  <Button size="small" icon={<ClearOutlined />} onClick={clearLogs}>
                    {text('清空日志')}
                  </Button>
                </Tooltip>
              </Space>
            }
            className={styles.card}
          >
            <div className={`${styles.shellGrid} ${terminalCollapsed ? styles.terminalCollapsedGrid : ''} ${logsCollapsed ? styles.logsCollapsedGrid : ''}`}>
              <section
                className={`${styles.terminalPane} ${terminalCollapsed ? styles.collapsedPane : ''}`}
                onClick={() => terminalCollapsed && setTerminalCollapsed(false)}
              >
                <div className={styles.paneHeader}>
                  <Space size={8}>
                    <CodeOutlined />
                    <span>Shell</span>
                  </Space>
                  <Space size={8}>
                    {!terminalCollapsed && (
                      <Text className={styles.cwd} title={session?.cwd || currentPath}>
                        {session?.cwd || currentPath}
                      </Text>
                    )}
                    <Tooltip title={terminalCollapsed ? text('展开交互终端') : text('折叠交互终端')}>
                      <Button
                        type="text"
                        size="small"
                        icon={terminalCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setTerminalCollapsed(!terminalCollapsed)}
                      />
                    </Tooltip>
                  </Space>
                </div>
                {!terminalCollapsed && (
                  <>
                    <div className={styles.terminalOutput}>
                      <pre>{terminalBuffer || text('终端启动中...')}</pre>
                      <div ref={terminalEndRef} />
                    </div>
                    <div className={styles.commandRow}>
                      <span className={styles.prompt} title={promptText}>{promptText}</span>
                      <Input
                        value={command}
                        onChange={(event) => setCommand(event.target.value)}
                        onPressEnter={sendCommand}
                        onKeyDown={handleCommandKeyDown}
                        placeholder={`${promptText} ${text('输入命令后按 Enter')}`}
                        variant="borderless"
                        className={styles.commandInput}
                      />
                      <Button type="primary" icon={<SendOutlined />} onClick={sendCommand} disabled={!session || !command.trim()}>
                        {text('执行')}
                      </Button>
                    </div>
                  </>
                )}
              </section>

              <section
                className={`${styles.logsPane} ${logsCollapsed ? styles.collapsedPane : ''}`}
                onClick={() => logsCollapsed && setLogsCollapsed(false)}
              >
                <div className={styles.paneHeader}>
                  <Space size={8}>
                    <ConsoleSqlOutlined />
                    <span>{text('命令日志')}</span>
                    <Tag color={errorCount > 0 ? 'error' : runningCount > 0 ? 'processing' : 'success'}>
                      {runningCount > 0 ? `${runningCount} ${text('运行中')}` : text('就绪')}
                    </Tag>
                  </Space>
                  <Space size={8}>
                    {!logsCollapsed && <Text className={styles.logCount}>{logs.length} {text('条')}</Text>}
                    <Tooltip title={logsCollapsed ? text('展开命令日志') : text('折叠命令日志')}>
                      <Button
                        type="text"
                        size="small"
                        icon={logsCollapsed ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                        onClick={() => setLogsCollapsed(!logsCollapsed)}
                      />
                    </Tooltip>
                  </Space>
                </div>

                {!logsCollapsed && (
                  <div className={styles.logsList}>
                    {logs.length === 0 ? (
                      <div className={styles.emptyState}>
                        <Empty description={text('暂无命令执行记录')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className={`${styles.logEntry} ${styles[log.status] || ''} ${hasOutput(log) ? styles.clickableLog : ''}`}
                          onClick={() => hasOutput(log) && toggleLogExpansion(log.id)}
                        >
                          <div className={styles.logHeader}>
                            <Space size={6}>
                              <Text type="secondary" className={styles.time}>
                                {formatTime(log.timestamp)}
                              </Text>
                              <Tag color={getStatusColor(log.status)}>{getStatusText(log.status)}</Tag>
                            </Space>
                            {hasOutput(log) && (
                              <Button
                                type="text"
                                size="small"
                                icon={expandedLogs.has(log.id) ? <UpOutlined /> : <DownOutlined />}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggleLogExpansion(log.id)
                                }}
                              />
                            )}
                          </div>
                          <Text code className={styles.commandText}>
                            {log.command}
                          </Text>
                          {hasOutput(log) && expandedLogs.has(log.id) && (
                            <div className={styles.output}>
                              {log.output && <pre className={styles.stdout}>{log.output}</pre>}
                              {log.error && <pre className={styles.stderr}>{log.error}</pre>}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </section>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

export default CommandLogWindow
