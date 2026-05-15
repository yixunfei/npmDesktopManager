import React, { useState } from 'react'
import { Modal, Table, Tag, Alert, Button, Space, Spin, Typography, Card, Row, Col, Descriptions, message } from 'antd'
import {
  WarningOutlined, CheckCircleOutlined,
  SecurityScanOutlined, InfoCircleOutlined
} from '@ant-design/icons'

const { Text, Title, Paragraph } = Typography

interface SecurityAuditModalProps {
  visible: boolean
  projectPath?: string
  scope?: 'project' | 'global'
  onClose: () => void
}

interface Vulnerability {
  name: string
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical'
  version: string
  via: string
  description: string
  range?: string
  nodes?: string[]
  effects?: string[]
  fixAvailable?: boolean
  fixVersion?: string
  isSemverMajor?: boolean
  url?: string
  advisories: AuditAdvisory[]
}

interface AuditAdvisory {
  title: string
  severity?: string
  range?: string
  url?: string
  cwe?: string[]
  cvss?: {
    score?: number
    vectorString?: string
  }
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({
  visible,
  projectPath = '',
  scope = 'project',
  onClose
}) => {
  const [loading, setLoading] = useState(false)
  const [auditResult, setAuditResult] = useState<any>(null)
  const [fixing, setFixing] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<Vulnerability | null>(null)
  const isGlobal = scope === 'global'
  
  React.useEffect(() => {
    if (visible && (isGlobal || projectPath)) {
      runAudit()
    }
  }, [visible, projectPath, scope])
  
  const runAudit = async () => {
    setLoading(true)
    try {
      const result = isGlobal
        ? await window.electronAPI.npm.globalAudit()
        : await window.electronAPI.npm.audit(projectPath)
      setAuditResult(result)
      if (result?.error) {
        message.warning(result.error)
      }
    } catch (error: any) {
      message.error(error.message || '安全审计失败')
    } finally {
      setLoading(false)
    }
  }
  
  const handleFix = async () => {
    if (isGlobal) {
      message.info('npm 不支持可靠的全局 audit fix，请在对应项目中修复依赖版本')
      return
    }

    setFixing(true)
    try {
      const output = await window.electronAPI.npm.auditFix(projectPath)
      message.success(output ? '自动修复命令已执行，请查看终端日志确认结果' : '自动修复完成')
      await runAudit()
    } catch (error: any) {
      message.error(error.message || '自动修复失败')
    } finally {
      setFixing(false)
    }
  }
  
  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      info: 'default',
      low: 'green',
      moderate: 'orange',
      high: 'red',
      critical: 'magenta'
    }
    return colors[severity] || 'default'
  }
  
  const vulnerabilities: Vulnerability[] = auditResult?.vulnerabilities
    ? Object.entries(auditResult.vulnerabilities).map(([name, data]: [string, any]) => {
        const advisories = normalizeAdvisories(data.via)
        const fixAvailable = typeof data.fixAvailable === 'object' ? data.fixAvailable : null
        const firstAdvisory = advisories[0]
        return {
          name,
          severity: data.severity,
          version: data.version || data.range || '-',
          via: advisories.map((item) => item.title).join(', ') || stringifyVia(data.via),
          description: firstAdvisory?.title || data.title || '该依赖存在已知安全风险，建议查看详情并升级到修复版本。',
          range: data.range || firstAdvisory?.range,
          nodes: data.nodes || [],
          effects: data.effects || [],
          fixAvailable: !!data.fixAvailable,
          fixVersion: fixAvailable?.version,
          isSemverMajor: !!fixAvailable?.isSemVerMajor,
          url: firstAdvisory?.url || data.url,
          advisories
        }
      })
    : []
  
  const metadata = auditResult?.metadata
  const totalVulnerabilities = metadata?.vulnerabilities 
    ? Object.values(metadata.vulnerabilities).reduce((a: number, b: any) => a + b, 0) as number
    : vulnerabilities.length
  
  const columns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 120,
      render: (severity: string) => (
        <Tag color={getSeverityColor(severity)} icon={
          severity === 'critical' || severity === 'high' 
            ? <WarningOutlined /> 
            : undefined
        }>
          {severity?.toUpperCase?.() || 'UNKNOWN'}
        </Tag>
      )
    },
    {
      title: '影响范围',
      dataIndex: 'version',
      key: 'version',
      width: 130
    },
    {
      title: '问题说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: '修复',
      key: 'fix',
      width: 170,
      render: (_: any, record: Vulnerability) => (
        record.fixAvailable ? (
          <Tag color={record.isSemverMajor ? 'orange' : 'green'} icon={<CheckCircleOutlined />}>
            {record.fixVersion ? `可修复到 v${record.fixVersion}` : '可修复'}
          </Tag>
        ) : (
          <Tag color="red">暂无自动修复</Tag>
        )
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: any, record: Vulnerability) => (
        <Space>
          <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setSelectedIssue(record)}>
            详情
          </Button>
          {record.url && (
            <Button size="small" type="link" onClick={() => window.electronAPI.openExternal(record.url!)}>
              公告
            </Button>
          )}
        </Space>
      )
    }
  ]
  
  return (
    <>
      <Modal
        title={
          <Space>
            <SecurityScanOutlined />
            {isGlobal ? '全局依赖安全审计' : '项目安全审计'}
          </Space>
        }
        open={visible}
        onCancel={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button onClick={runAudit} loading={loading}>
              重新扫描
            </Button>
            {totalVulnerabilities > 0 && (
              <Button type="primary" onClick={handleFix} loading={fixing} disabled={isGlobal}>
                自动修复
              </Button>
            )}
          </Space>
        }
        width={980}
      >
        <Spin spinning={loading}>
          {metadata && (
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <Title level={2} style={{ margin: 0, color: '#52c41a' }}>
                      {metadata.vulnerabilities?.info || 0}
                    </Title>
                    <Text type="secondary">信息</Text>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <Title level={2} style={{ margin: 0, color: '#faad14' }}>
                      {metadata.vulnerabilities?.low || 0}
                    </Title>
                    <Text type="secondary">低危</Text>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <Title level={2} style={{ margin: 0, color: '#fa8c16' }}>
                      {metadata.vulnerabilities?.moderate || 0}
                    </Title>
                    <Text type="secondary">中危</Text>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <Title level={2} style={{ margin: 0, color: '#f5222d' }}>
                      {(metadata.vulnerabilities?.high || 0) + (metadata.vulnerabilities?.critical || 0)}
                    </Title>
                    <Text type="secondary">高/严重</Text>
                  </div>
                </Card>
              </Col>
            </Row>
          )}

          {totalVulnerabilities === 0 ? (
            <Alert
              message="未发现安全漏洞"
              description={isGlobal ? '当前全局依赖没有返回已知安全漏洞' : '您的项目依赖没有已知的安全漏洞'}
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          ) : (
            <>
              <Alert
                message={`发现 ${totalVulnerabilities} 个安全漏洞`}
                description={isGlobal ? '全局审计结果依赖 npm 当前版本支持情况；建议优先在具体项目中修复依赖。' : '建议先查看详情，再执行自动修复或手动升级关键依赖。'}
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: 16 }}
              />
              <Table
                dataSource={vulnerabilities}
                columns={columns}
                rowKey="name"
                pagination={false}
                size="small"
              />
            </>
          )}
        </Spin>
      </Modal>

      <Modal
        title="安全问题详情"
        open={!!selectedIssue}
        onCancel={() => setSelectedIssue(null)}
        footer={<Button onClick={() => setSelectedIssue(null)}>关闭</Button>}
        width={760}
      >
        {selectedIssue && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="包名">{selectedIssue.name}</Descriptions.Item>
              <Descriptions.Item label="严重程度">
                <Tag color={getSeverityColor(selectedIssue.severity)}>{selectedIssue.severity.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="影响范围">{selectedIssue.range || selectedIssue.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="影响路径">
                {selectedIssue.nodes?.length ? selectedIssue.nodes.join(', ') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="影响依赖">
                {selectedIssue.effects?.length ? selectedIssue.effects.join(', ') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="自动修复">
                {selectedIssue.fixAvailable
                  ? `${selectedIssue.fixVersion ? `升级到 ${selectedIssue.fixVersion}` : '可修复'}${selectedIssue.isSemverMajor ? '（可能包含破坏性变更）' : ''}`
                  : '暂无自动修复方案'}
              </Descriptions.Item>
            </Descriptions>
            {selectedIssue.advisories.map((advisory, index) => (
              <Card key={`${advisory.title}-${index}`} size="small" title={advisory.title || '安全公告'}>
                <Paragraph>
                  影响范围: {advisory.range || selectedIssue.range || '-'}
                </Paragraph>
                {advisory.cwe?.length ? <Paragraph>CWE: {advisory.cwe.join(', ')}</Paragraph> : null}
                {advisory.cvss?.score ? <Paragraph>CVSS: {advisory.cvss.score}</Paragraph> : null}
                {advisory.url ? (
                  <Button size="small" type="link" onClick={() => window.electronAPI.openExternal(advisory.url!)}>
                    查看公告原文
                  </Button>
                ) : null}
              </Card>
            ))}
          </Space>
        )}
      </Modal>
    </>
  )
}

function normalizeAdvisories(via: any): AuditAdvisory[] {
  if (!Array.isArray(via)) return []
  return via
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: item.title || item.name || '安全问题',
      severity: item.severity,
      range: item.range,
      url: item.url,
      cwe: item.cwe,
      cvss: item.cvss
    }))
}

function stringifyVia(via: any): string {
  if (Array.isArray(via)) {
    return via.map((item) => typeof item === 'string' ? item : item.title || item.name).filter(Boolean).join(', ')
  }
  return typeof via === 'string' ? via : ''
}
