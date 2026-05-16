import React, { useState } from 'react'
import { Modal, Card, Space, Tag, Typography, Alert, Radio } from 'antd'
import { SafetyOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'

const { Text } = Typography

interface PackageConflictModalProps {
  visible: boolean
  packageName: string
  currentVersion: string
  recommendedVersion: string
  safeVersion: string
  onSelect: (version: string | 'skip') => void
  onCancel: () => void
}

export const PackageConflictModal: React.FC<PackageConflictModalProps> = ({
  visible,
  packageName,
  currentVersion,
  recommendedVersion,
  safeVersion,
  onSelect,
  onCancel
}) => {
  const [selectedOption, setSelectedOption] = useState<string>('recommended')

  const handleConfirm = () => {
    if (selectedOption === 'skip') {
      onSelect('skip')
    } else if (selectedOption === 'recommended') {
      onSelect(recommendedVersion)
    } else {
      onSelect(safeVersion)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>版本冲突</span>
        </Space>
      }
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      okText="确认选择"
      cancelText="取消"
      width={700}
    >
      <Alert
        title="发现版本冲突"
        description={
          <span>
            包 <Text strong>{packageName}</Text> 有安全更新，但与推荐版本存在冲突。
            请选择您希望使用的版本。
          </span>
        }
        type="warning"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">当前版本：</Text>
        <Tag style={{ marginLeft: 8 }}>v{currentVersion}</Tag>
      </div>

      <Radio.Group
        value={selectedOption}
        onChange={(e) => setSelectedOption(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Radio value="recommended" style={{ width: '100%' }}>
            <Card size="small" style={{ marginLeft: 8, borderColor: selectedOption === 'recommended' ? '#1890ff' : undefined }}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                <div>
                  <div>
                    <Text strong>推荐版本</Text>
                    <Tag color="green" style={{ marginLeft: 8 }}>兼容性优先</Tag>
                  </div>
                  <Text type="secondary">v{recommendedVersion}</Text>
                </div>
              </Space>
            </Card>
          </Radio>

          <Radio value="safe" style={{ width: '100%' }}>
            <Card size="small" style={{ marginLeft: 8, borderColor: selectedOption === 'safe' ? '#faad14' : undefined }}>
              <Space>
                <SafetyOutlined style={{ color: '#faad14', fontSize: 20 }} />
                <div>
                  <div>
                    <Text strong>安全版本</Text>
                    <Tag color="orange" style={{ marginLeft: 8 }}>安全性优先</Tag>
                    <Tag color="red" style={{ marginLeft: 8 }}>有安全修复</Tag>
                  </div>
                  <Text type="secondary">v{safeVersion}</Text>
                </div>
              </Space>
            </Card>
          </Radio>

          <Radio value="skip" style={{ width: '100%' }}>
            <Card size="small" style={{ marginLeft: 8, borderColor: selectedOption === 'skip' ? '#d9d9d9' : undefined }}>
              <Space>
                <div style={{ width: 20 }}></div>
                <div>
                  <div>
                    <Text strong>跳过此包</Text>
                  </div>
                  <Text type="secondary">暂时不更新，保持当前版本</Text>
                </div>
              </Space>
            </Card>
          </Radio>
        </Space>
      </Radio.Group>
    </Modal>
  )
}
