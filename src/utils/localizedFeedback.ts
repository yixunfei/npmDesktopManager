import { message, Modal } from 'antd'
import type { ArgsProps as MessageArgsProps } from 'antd/es/message'
import type { ModalFuncProps } from 'antd/es/modal'
import { translateText } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'

type MessageMethod = typeof message.success

function currentLanguage() {
  return useSettingsStore.getState().language
}

function localizeValue<T>(value: T): T {
  if (typeof value === 'string') {
    return translateText(currentLanguage(), value) as T
  }

  return value
}

function localizeMessageArgs(config: MessageArgsProps): MessageArgsProps {
  return {
    ...config,
    content: localizeValue(config.content)
  }
}

function invokeMessage(method: MessageMethod, content: Parameters<MessageMethod>[0], ...rest: any[]) {
  if (typeof content === 'object' && content && 'content' in content) {
    return (method as any)(localizeMessageArgs(content as MessageArgsProps), ...rest)
  }

  return (method as any)(localizeValue(content), ...rest)
}

function localizeModalConfig(config: ModalFuncProps): ModalFuncProps {
  return {
    ...config,
    title: localizeValue(config.title),
    content: localizeValue(config.content),
    okText: localizeValue(config.okText),
    cancelText: localizeValue(config.cancelText)
  }
}

export const localizedMessage = {
  success: (content: Parameters<MessageMethod>[0], ...rest: any[]) => invokeMessage(message.success, content, ...rest),
  error: (content: Parameters<MessageMethod>[0], ...rest: any[]) => invokeMessage(message.error, content, ...rest),
  warning: (content: Parameters<MessageMethod>[0], ...rest: any[]) => invokeMessage(message.warning, content, ...rest),
  info: (content: Parameters<MessageMethod>[0], ...rest: any[]) => invokeMessage(message.info, content, ...rest),
  loading: (content: Parameters<MessageMethod>[0], ...rest: any[]) => invokeMessage(message.loading, content, ...rest),
  open: (config: MessageArgsProps) => message.open(localizeMessageArgs(config)),
  destroy: message.destroy
}

export const localizedModal = {
  confirm: (config: ModalFuncProps) => Modal.confirm(localizeModalConfig(config)),
  warning: (config: ModalFuncProps) => Modal.warning(localizeModalConfig(config)),
  error: (config: ModalFuncProps) => Modal.error(localizeModalConfig(config)),
  info: (config: ModalFuncProps) => Modal.info(localizeModalConfig(config)),
  success: (config: ModalFuncProps) => Modal.success(localizeModalConfig(config))
}
