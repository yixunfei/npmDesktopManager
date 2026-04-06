import React from 'react'
import { Tag, Button, Space, Popconfirm, Tooltip } from 'antd'
import {
  DeleteOutlined,
  SyncOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { PackageInfo } from '../../stores/packageStore'
import styles from './PackageListItem.module.css'

interface PackageListItemProps {
  pkg: PackageInfo
  onUpdate: (name: string) => void
  onUninstall: (name: string) => void
  showType?: boolean
}

export const PackageListItem: React.FC<PackageListItemProps> = ({
  pkg,
  onUpdate,
  onUninstall,
  showType = false
}) => {
  return (
    <div className={styles.item}>
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{pkg.name}</span>
          {pkg.outdated && (
            <Tooltip title="有新版本可用">
              <WarningOutlined className={styles.warning} />
            </Tooltip>
          )}
          {showType && pkg.type && (
            <Tag color={pkg.type === 'dependencies' ? 'green' : 'orange'}>
              {pkg.type === 'dependencies' ? '生产依赖' : '开发依赖'}
            </Tag>
          )}
        </div>
        <div className={styles.versionRow}>
          <span className={styles.version}>当前: v{pkg.version}</span>
          {pkg.latest && pkg.latest !== pkg.version && (
            <span className={styles.latest}>最新: v{pkg.latest}</span>
          )}
        </div>
      </div>
      
      <Space className={styles.actions}>
        {pkg.outdated && (
          <Tooltip title="更新到最新版本">
            <Button
              type="default"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => onUpdate(pkg.name)}
            >
              更新
            </Button>
          </Tooltip>
        )}
        <Popconfirm
          title="确认卸载此包吗？"
          onConfirm={() => onUninstall(pkg.name)}
          okText="确认"
          cancelText="取消"
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
          >
            卸载
          </Button>
        </Popconfirm>
      </Space>
    </div>
  )
}