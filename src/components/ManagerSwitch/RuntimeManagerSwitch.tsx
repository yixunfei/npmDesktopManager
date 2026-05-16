import React from 'react'
import { Segmented } from 'antd'
import { useNavigate } from 'react-router-dom'

const MANAGER_ROUTES: Record<PackageManagerId, string> = {
  npm: '/npm',
  pip: '/pip',
  maven: '/maven',
  cargo: '/cargo',
  gradle: '/gradle',
  go: '/go'
}

const MANAGER_OPTIONS: Array<{ label: string; value: PackageManagerId }> = [
  { label: 'npm', value: 'npm' },
  { label: 'pip', value: 'pip' },
  { label: 'Maven', value: 'maven' },
  { label: 'Cargo', value: 'cargo' },
  { label: 'Gradle', value: 'gradle' },
  { label: 'Go', value: 'go' }
]

interface RuntimeManagerSwitchProps {
  active: PackageManagerId
}

const RuntimeManagerSwitch: React.FC<RuntimeManagerSwitchProps> = ({ active }) => {
  const navigate = useNavigate()

  return (
    <Segmented<PackageManagerId>
      value={active}
      options={MANAGER_OPTIONS}
      onChange={(value) => navigate(MANAGER_ROUTES[value])}
    />
  )
}

export default RuntimeManagerSwitch
