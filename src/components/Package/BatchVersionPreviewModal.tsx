import React, { useState, useEffect } from 'react'
import { Modal, Table, Checkbox, Space, Tag, Typography, Tooltip } from 'antd'
import { InfoCircleOutlined, SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons'
import { PackageInfo } from '../../stores/packageStore'
import { resolvePackageUpdateTarget, useSettingsStore } from '../../stores/settingsStore'
import semver from 'semver'

const { Text } = Typography

interface BatchVersionPreviewModalProps {
  visible: boolean
  packages: PackageInfo[]
  onConfirm: (selectedPackages: string[]) => void
  onCancel: () => void
}

interface PreviewPackage extends PackageInfo {
  selected: boolean
  hasConflict?: boolean
  targetVersion: string
  updateType: 'patch' | 'minor' | 'major' | 'unknown'
}

export const BatchVersionPreviewModal: React.FC<BatchVersionPreviewModalProps> = ({
  visible,
  packages,
  onConfirm,
  onCancel
}) => {
  const [previewPackages, setPreviewPackages] = useState<PreviewPackage[]>([])
  const updateStrategy = useSettingsStore((state) => state.updateStrategy)

  useEffect(() => {
    if (visible && packages.length > 0) {
      const preview = packages.map(pkg => {
        const targetVersion = resolvePackageUpdateTarget(pkg, updateStrategy) || pkg.version
        return {
          ...pkg,
          selected: true,
          targetVersion,
          updateType: getUpdateType(pkg.version, targetVersion)
        }
      })
      setPreviewPackages(preview)
    }
  }, [visible, packages, updateStrategy])

  const getUpdateType = (current: string, latest: string): 'patch' | 'minor' | 'major' | 'unknown' => {
    try {
      const currentVer = semver.parse(current)
      const latestVer = semver.parse(latest)
      
      if (!currentVer || !latestVer) return 'unknown'
      
      if (latestVer.major > currentVer.major) return 'major'
      if (latestVer.minor > currentVer.minor) return 'minor'
      if (latestVer.patch > currentVer.patch) return 'patch'
      
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const getUpdateTypeIcon = (type: string) => {
    switch (type) {
      case 'patch':
        return <Tag color="green">补丁</Tag>
      case 'minor':
        return <Tag color="blue">次要</Tag>
      case 'major':
        return <Tag color="orange">主要</Tag>
      default:
        return <Tag color="default">未知</Tag>
    }
  }

  const getStrategyTag = () => {
    switch (updateStrategy) {
      case 'security':
        return <Tag color="red" icon={<SafetyCertificateOutlined />}>安全优先</Tag>
      case 'latest':
        return <Tag color="purple">最新</Tag>
      case 'smart':
        return <Tag color="blue">智能</Tag>
      default:
        return <Tag color="green">推荐</Tag>
    }
  }

  const toggleSelect = (packageName: string, checked: boolean) => {
    setPreviewPackages(prev =>
      prev.map(pkg =>
        pkg.name === packageName ? { ...pkg, selected: checked } : pkg
      )
    )
  }

  const toggleSelectAll = (checked: boolean) => {
    setPreviewPackages(prev =>
      prev.map(pkg => ({ ...pkg, selected: checked }))
    )
  }

  const handleConfirm = () => {
    const selected = previewPackages.filter(pkg => pkg.selected).map(pkg => pkg.name)
    onConfirm(selected)
  }

  const selectedCount = previewPackages.filter(pkg => pkg.selected).length

  const columns = [
    {
      title: (
        <Checkbox
          checked={previewPackages.length > 0 && selectedCount === previewPackages.length}
          indeterminate={selectedCount > 0 && selectedCount < previewPackages.length}
          onChange={(e) => toggleSelectAll(e.target.checked)}
        />
      ),
      key: 'select',
      width: 60,
      render: (_: any, record: PreviewPackage) => (
        <Checkbox
          checked={record.selected}
          onChange={(e) => toggleSelect(record.name, e.target.checked)}
        />
      ),
    },
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string, record: PreviewPackage) => (
        <Space>
          <span>{text}</span>
          {record.outdated && (
            <Tooltip title="有新版本">
              <WarningOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '当前版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (text: string) => <Tag>v{text}</Tag>,
    },
    {
      title: '目标版本',
      key: 'targetVersion',
      width: 100,
      render: (_: any, record: PreviewPackage) => (
        <Tag color={record.targetVersion !== record.version ? 'blue' : 'green'}>
          v{record.targetVersion}
        </Tag>
      ),
    },
    {
      title: '更新类型',
      key: 'updateType',
      width: 100,
      render: (_: any, record: PreviewPackage) => getUpdateTypeIcon(record.updateType),
    },
    {
      title: '策略',
      key: 'strategy',
      width: 110,
      render: () => getStrategyTag(),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (text: string) => (
        <Tag color={text === 'dependencies' ? 'green' : 'orange'}>
          {text === 'dependencies' ? '生产' : '开发'}
        </Tag>
      ),
    },
  ]

  return (
    <Modal
      title={
        <Space>
          <InfoCircleOutlined />
          <span>版本更新预览</span>
          <Tag color="blue">{selectedCount} / {previewPackages.length}</Tag>
        </Space>
      }
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      okText={`更新选中 (${selectedCount})`}
      cancelText="取消"
      width={900}
      okButtonProps={{ disabled: selectedCount === 0 }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          请确认要更新的包，您可以取消勾选跳过特定包的更新。
          {updateStrategy === 'security' ? ' 当前为安全优先策略，可能会选择更激进的目标版本。' : ''}
        </Text>
      </div>
      
      <Table
        dataSource={previewPackages}
        columns={columns}
        rowKey="name"
        size="small"
        pagination={false}
        scroll={{ y: 400 }}
      />
    </Modal>
  )
}
