import React, { useState } from 'react'
import { Modal, Table, Tag, Alert, Button, Space, Spin, Typography, Card, Row, Col } from 'antd'
import {
  WarningOutlined, CheckCircleOutlined,
  SecurityScanOutlined
} from '@ant-design/icons'

const { Text, Title } = Typography

interface SecurityAuditModalProps {
  visible: boolean
  projectPath: string
  onClose: () => void
}

interface Vulnerability {
  name: string
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical'
  version: string
  via: string[]
  fixAvailable?: boolean
  fixVersion?: string
  url?: string
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({
  visible,
  projectPath,
  onClose
}) => {
  const [loading, setLoading] = useState(false)
  const [auditResult, setAuditResult] = useState<any>(null)
  const [fixing, setFixing] = useState(false)
  
  React.useEffect(() => {
    if (visible && projectPath) {
      runAudit()
    }
  }, [visible, projectPath])
  
  const runAudit = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.npm.audit(projectPath)
      setAuditResult(result)
    } catch (error) {
      console.error('Audit failed:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleFix = async () => {
    setFixing(true)
    try {
      await window.electronAPI.npm.auditFix(projectPath)
      await runAudit()
    } catch (error) {
      console.error('Audit fix failed:', error)
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
  
  const vulnerabilities = auditResult?.vulnerabilities 
    ? Object.entries(auditResult.vulnerabilities).map(([name, data]: [string, any]) => ({
        name,
        severity: data.severity,
        version: data.version,
        via: Array.isArray(data.via) ? data.via.map((v: any) => v.title || v).join(', ') : data.via,
        fixAvailable: !!data.fixAvailable,
        fixVersion: data.fixAvailable?.version,
        url: data.url
      }))
    : []
  
  const metadata = auditResult?.metadata
  const totalVulnerabilities = metadata?.vulnerabilities 
    ? Object.values(metadata.vulnerabilities).reduce((a: number, b: any) => a + b, 0) as number
    : 0
  
  const columns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Tag color={getSeverityColor(severity)} icon={
          severity === 'critical' || severity === 'high' 
            ? <WarningOutlined /> 
            : undefined
        }>
          {severity.toUpperCase()}
        </Tag>
      )
    },
    {
      title: '当前版本',
      dataIndex: 'version',
      key: 'version'
    },
    {
      title: '漏洞描述',
      dataIndex: 'via',
      key: 'via',
      ellipsis: true
    },
    {
      title: '修复',
      key: 'fix',
      render: (_: any, record: Vulnerability) => (
        record.fixAvailable ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            可修复 → v{record.fixVersion}
          </Tag>
        ) : (
          <Tag color="red">暂无修复</Tag>
        )
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Vulnerability) => (
        record.url ? (
          <Button 
            size="small" 
            type="link"
            onClick={() => window.electronAPI.openExternal(record.url!)}
          >
            查看详情
          </Button>
        ) : null
      )
    }
  ]
  
  return (
    <Modal
      title={
        <Space>
          <SecurityScanOutlined />
          安全审计
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
            <Button type="primary" onClick={handleFix} loading={fixing}>
              自动修复
            </Button>
          )}
        </Space>
      }
      width={900}
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
            description="您的项目依赖没有已知的安全漏洞"
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
          />
        ) : (
          <>
            <Alert
              message={`发现 ${totalVulnerabilities} 个安全漏洞`}
              description="建议尽快修复这些漏洞以确保项目安全"
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
  )
}