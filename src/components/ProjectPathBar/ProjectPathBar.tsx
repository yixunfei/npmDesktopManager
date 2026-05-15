import React from 'react'
import { Button, Tooltip } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import styles from './ProjectPathBar.module.css'

interface ProjectPathBarProps {
  label?: string
  buttonText?: string
  className?: string
  compact?: boolean
}

const ProjectPathBar: React.FC<ProjectPathBarProps> = ({
  label = '项目路径',
  buttonText = '选择目录',
  className,
  compact = false
}) => {
  const currentPath = useAppStore((state) => state.currentPath)
  const setCurrentPath = useAppStore((state) => state.setCurrentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const handleSelectDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return

    setCurrentPath(path)
    addNotification({
      type: 'info',
      message: '项目路径已切换',
      description: path
    })
  }

  const displayPath = currentPath || '未选择'

  return (
    <div className={[styles.pathBar, compact ? styles.compact : styles.expanded, className].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}:</span>
      <Tooltip title={displayPath}>
        <span className={[styles.value, currentPath ? '' : styles.empty].filter(Boolean).join(' ')}>
          {displayPath}
        </span>
      </Tooltip>
      <Button size="small" icon={<FolderOpenOutlined />} onClick={handleSelectDirectory}>
        {buttonText}
      </Button>
    </div>
  )
}

export default ProjectPathBar
