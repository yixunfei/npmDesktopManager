import { useSettingsStore, AppLanguage } from './stores/settingsStore'

type TranslationKey =
  | 'app.settings'
  | 'common.cancel'
  | 'common.save'
  | 'common.search'
  | 'common.selectDirectory'
  | 'layout.globalManagement'
  | 'layout.mavenManagement'
  | 'layout.npmManagement'
  | 'layout.pipManagement'
  | 'layout.search'
  | 'layout.settings'
  | 'layout.themeTooltip'
  | 'layout.toolVersions'
  | 'settings.language'
  | 'settings.languageDescription'
  | 'settings.languageEnglish'
  | 'settings.languageChinese'
  | 'settings.preferences'
  | 'settings.savedHint'

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = {
  'zh-CN': {
    'app.settings': '设置',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.search': '搜索',
    'common.selectDirectory': '选择目录',
    'layout.globalManagement': '全局管理',
    'layout.mavenManagement': 'Maven 管理',
    'layout.npmManagement': 'npm 管理',
    'layout.pipManagement': 'pip 管理',
    'layout.search': '搜索',
    'layout.settings': '设置',
    'layout.themeTooltip': '主题跟随系统、亮色或暗色',
    'layout.toolVersions': '项目工具版本',
    'settings.language': '界面语言',
    'settings.languageDescription': '切换菜单、设置页和系统控件语言。更多业务文案会逐步纳入同一套翻译。',
    'settings.languageEnglish': 'English',
    'settings.languageChinese': '简体中文',
    'settings.preferences': '偏好设置',
    'settings.savedHint': '设置已自动保存'
  },
  'en-US': {
    'app.settings': 'Settings',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.search': 'Search',
    'common.selectDirectory': 'Select Folder',
    'layout.globalManagement': 'Global Management',
    'layout.mavenManagement': 'Maven Management',
    'layout.npmManagement': 'npm Management',
    'layout.pipManagement': 'pip Management',
    'layout.search': 'Search',
    'layout.settings': 'Settings',
    'layout.themeTooltip': 'Follow system, light, or dark theme',
    'layout.toolVersions': 'Project Tool Versions',
    'settings.language': 'Interface Language',
    'settings.languageDescription': 'Switch navigation, Settings, and system component language. More workflow text will join the same translation set over time.',
    'settings.languageEnglish': 'English',
    'settings.languageChinese': 'Simplified Chinese',
    'settings.preferences': 'Preferences',
    'settings.savedHint': 'Settings are saved automatically'
  }
}

export function translate(language: AppLanguage, key: TranslationKey): string {
  return dictionaries[language]?.[key] || dictionaries['zh-CN'][key] || key
}

export function useT() {
  const language = useSettingsStore((state) => state.language)
  return (key: TranslationKey) => translate(language, key)
}

export type { TranslationKey }
