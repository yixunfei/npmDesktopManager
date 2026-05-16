import React from 'react'
import { useAppStore } from '../../stores/appStore'
import { App } from 'antd'
import { useEffect } from 'react'
import { translateText } from '../../i18n'
import { useSettingsStore } from '../../stores/settingsStore'

export const NotificationContainer: React.FC = () => {
  const notifications = useAppStore((state) => state.notifications)
  const language = useSettingsStore((state) => state.language)
  const { notification } = App.useApp()
  
  useEffect(() => {
    notifications.forEach((n) => {
      notification[n.type]({
        title: translateText(language, n.message),
        description: n.description ? translateText(language, n.description) : undefined,
        duration: 4,
        key: n.id,
        onClose: () => {
          useAppStore.getState().removeNotification(n.id)
        }
      })
    })
  }, [language, notification, notifications])
  
  return null
}
