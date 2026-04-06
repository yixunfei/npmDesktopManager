import React from 'react'
import { useAppStore } from '../../stores/appStore'
import { App } from 'antd'
import { useEffect } from 'react'

export const NotificationContainer: React.FC = () => {
  const notifications = useAppStore((state) => state.notifications)
  const { notification } = App.useApp()
  
  useEffect(() => {
    notifications.forEach((n) => {
      notification[n.type]({
        message: n.message,
        description: n.description,
        duration: 4,
        key: n.id,
        onClose: () => {
          useAppStore.getState().removeNotification(n.id)
        }
      })
    })
  }, [notifications])
  
  return null
}