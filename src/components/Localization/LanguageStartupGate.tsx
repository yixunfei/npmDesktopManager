import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { Button, Modal, Radio, Space, Typography } from 'antd'
import { useT } from '../../i18n'
import { AppLanguage, useSettingsStore } from '../../stores/settingsStore'

const { Paragraph, Text, Title } = Typography

export const LanguageStartupGate: FC = () => {
  const t = useT()
  const language = useSettingsStore((state) => state.language)
  const languageInitialized = useSettingsStore((state) => state.languageInitialized)
  const initializeLanguage = useSettingsStore((state) => state.initializeLanguage)

  const [visible, setVisible] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en-US')
  const startupCheckedRef = useRef(false)

  useEffect(() => {
    document.documentElement.lang = language
    void window.electronAPI.app?.setMenuLanguage(language)
  }, [language])

  useEffect(() => {
    if (startupCheckedRef.current) return
    startupCheckedRef.current = true

    if (languageInitialized) return

    let cancelled = false

    const resolveStartupLanguage = async () => {
      try {
        const startup = await window.electronAPI.app?.getStartupLanguage()
        if (cancelled || useSettingsStore.getState().languageInitialized) return

        if (startup?.source === 'installer') {
          initializeLanguage(startup.language, 'installer')
          return
        }

        if (startup?.shouldPrompt) {
          setSelectedLanguage(startup.language || 'en-US')
          setVisible(true)
          return
        }

        initializeLanguage('en-US', 'default')
      } catch {
        if (!cancelled) {
          initializeLanguage('en-US', 'default')
        }
      }
    }

    void resolveStartupLanguage()

    return () => {
      cancelled = true
    }
  }, [initializeLanguage, languageInitialized])

  const confirmLanguage = () => {
    initializeLanguage(selectedLanguage, 'startup')
    setVisible(false)
  }

  return (
    <Modal
      centered
      closable={false}
      mask={{ closable: false }}
      open={visible}
      title={t('startup.languageTitle')}
      footer={[
        <Button key="continue" type="primary" onClick={confirmLanguage}>
          {t('common.continue')}
        </Button>
      ]}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('startup.languageSubtitle')}
        </Paragraph>
        <Radio.Group
          value={selectedLanguage}
          onChange={(event) => setSelectedLanguage(event.target.value)}
          style={{ width: '100%' }}
        >
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Radio value="en-US">
              <Space orientation="vertical" size={0}>
                <Title level={5} style={{ margin: 0 }}>English</Title>
                <Text type="secondary">{t('startup.languageEnglishDescription')}</Text>
              </Space>
            </Radio>
            <Radio value="zh-CN">
              <Space orientation="vertical" size={0}>
                <Title level={5} style={{ margin: 0 }}>简体中文</Title>
                <Text type="secondary">{t('startup.languageChineseDescription')}</Text>
              </Space>
            </Radio>
          </Space>
        </Radio.Group>
      </Space>
    </Modal>
  )
}
