import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutoComplete, Button, Collapse, Descriptions, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Table, Tabs, Tag, Tooltip } from 'antd'
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SecurityScanOutlined,
  SyncOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import styles from './MultiManager.module.css'

const COMMON_MAVEN_GOALS = ['clean', 'compile', 'test', 'package', 'install', 'clean package', 'dependency:tree']

function normalizePackageKey(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

interface MultiManagerPageProps {
  initialManager?: 'pip' | 'maven'
}

const MultiManagerPage: React.FC<MultiManagerPageProps> = ({ initialManager = 'pip' }) => {
  const navigate = useNavigate()
  const currentPath = useAppStore((state) => state.currentPath)
  const addNotification = useAppStore((state) => state.addNotification)

  const [pipPackages, setPipPackages] = useState<PipPackageInfo[]>([])
  const [pipOutdated, setPipOutdated] = useState<Record<string, PipPackageInfo>>({})
  const [pipLoading, setPipLoading] = useState(false)
  const [pipInstallVisible, setPipInstallVisible] = useState(false)
  const [requirementsVisible, setRequirementsVisible] = useState(false)
  const [requirements, setRequirements] = useState<string[]>([])
  const [pipScope, setPipScope] = useState<'environment' | 'user'>('environment')
  const [pipConfigScope, setPipConfigScope] = useState<PipConfigScope>('user')
  const [pipConfig, setPipConfig] = useState<PipConfigItem[]>([])
  const [pipCacheDir, setPipCacheDir] = useState('')
  const [pipConfigVisible, setPipConfigVisible] = useState(false)
  const [pipDetailVisible, setPipDetailVisible] = useState(false)
  const [pipDetail, setPipDetail] = useState<PipPackageDetail | null>(null)
  const [pipOutputVisible, setPipOutputVisible] = useState(false)
  const [pipOutput, setPipOutput] = useState('')
  const [pipAuditVisible, setPipAuditVisible] = useState(false)
  const [pipAuditIssues, setPipAuditIssues] = useState<PipAuditIssue[]>([])
  const [pipTreeVisible, setPipTreeVisible] = useState(false)
  const [pipTree, setPipTree] = useState<any>(null)
  const [pipSearchOptions, setPipSearchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [pipVersionOptions, setPipVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [pipMirror, setPipMirror] = useState<'official' | 'tsinghua' | 'aliyun'>('official')
  const [pipForm] = Form.useForm()
  const [pipConfigForm] = Form.useForm()

  const [mavenDeps, setMavenDeps] = useState<MavenDependencyInfo[]>([])
  const [mavenInfo, setMavenInfo] = useState<MavenGlobalInfo | null>(null)
  const [mavenLoading, setMavenLoading] = useState(false)
  const [mavenAddVisible, setMavenAddVisible] = useState(false)
  const [goalVisible, setGoalVisible] = useState(false)
  const [goalOutputVisible, setGoalOutputVisible] = useState(false)
  const [goalOutput, setGoalOutput] = useState('')
  const [mavenAuditVisible, setMavenAuditVisible] = useState(false)
  const [mavenAuditIssues, setMavenAuditIssues] = useState<MavenAuditIssue[]>([])
  const [mavenSearchOptions, setMavenSearchOptions] = useState<Array<{ value: string; label: string; dep: MavenSearchResult }>>([])
  const [mavenVersionOptions, setMavenVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [mavenMirror, setMavenMirror] = useState<'central' | 'aliyun' | 'tencent'>('central')
  const [customMavenGoals, setCustomMavenGoals] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('custom-maven-goals') || '[]')
    } catch {
      return []
    }
  })
  const [customGoal, setCustomGoal] = useState('')
  const [draggedGoal, setDraggedGoal] = useState<string | null>(null)
  const [mavenForm] = Form.useForm()
  const [goalForm] = Form.useForm()
  const [activeManager, setActiveManager] = useState<'pip' | 'maven'>(initialManager)

  const pipRows = useMemo(() => {
    return pipPackages.map((pkg) => ({
      ...pkg,
      latest: pipOutdated[normalizePackageKey(pkg.name)]?.latest,
      outdated: !!pipOutdated[normalizePackageKey(pkg.name)]
    }))
  }, [pipPackages, pipOutdated])

  const mavenGoalButtons = useMemo(() => {
    return [...customMavenGoals, ...COMMON_MAVEN_GOALS.filter((goal) => !customMavenGoals.includes(goal))]
  }, [customMavenGoals])

  useEffect(() => {
    localStorage.setItem('custom-maven-goals', JSON.stringify(customMavenGoals))
  }, [customMavenGoals])

  useEffect(() => {
    setActiveManager(initialManager)
  }, [initialManager])

  useEffect(() => {
    loadPipPackages()
    loadPipTooling()
  }, [currentPath, pipScope, pipConfigScope])

  useEffect(() => {
    if (currentPath) {
      loadMavenDependencies()
    }
    loadMavenInfo()
  }, [currentPath])

  const handleSelectDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (path) {
      useAppStore.getState().setCurrentPath(path)
      addNotification({
        type: 'info',
        message: '项目路径已切换',
        description: path
      })
    }
  }

  const getPipOptions = (): PipCommandOptions => ({
    cwd: currentPath,
    user: pipScope === 'user'
  })

  const loadPipPackages = async () => {
    setPipLoading(true)
    try {
      const options = getPipOptions()
      const [packages, outdated] = await Promise.all([
        window.electronAPI.pip.list(options),
        window.electronAPI.pip.outdated(options)
      ])
      setPipPackages(packages)
      setPipOutdated(Object.fromEntries(outdated.map((pkg) => [normalizePackageKey(pkg.name), pkg])))
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '读取 pip 包失败',
        description: error.message
      })
    } finally {
      setPipLoading(false)
    }
  }

  const loadPipTooling = async () => {
    try {
      const [config, cacheDir] = await Promise.all([
        window.electronAPI.pip.configList(pipConfigScope),
        window.electronAPI.pip.cacheDir()
      ])
      setPipConfig(config)
      setPipCacheDir(cacheDir)
    } catch {
      setPipConfig([])
      setPipCacheDir('')
    }
  }

  const installPipPackage = async (values: any) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.install({
        packageName: values.packageName,
        version: values.version,
        cwd: currentPath,
        user: pipScope === 'user',
        upgrade: values.upgrade === 'true',
        indexUrl: values.indexUrl,
        extraIndexUrl: values.extraIndexUrl,
        trustedHost: values.trustedHost
      })
      setPipInstallVisible(false)
      pipForm.resetFields()
      await loadPipPackages()
      addNotification({ type: 'success', message: 'pip 包安装成功' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 包安装失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const updatePipPackage = async (packageName: string) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.update({ packageName, cwd: currentPath, user: pipScope === 'user' })
      await loadPipPackages()
      addNotification({ type: 'success', message: `${packageName} 已升级` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 包升级失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const uninstallPipPackage = async (packageName: string) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.uninstall({ packageName, cwd: currentPath, user: pipScope === 'user' })
      await loadPipPackages()
      addNotification({ type: 'success', message: `${packageName} 已卸载` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 包卸载失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const installRequirements = async () => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.install({ cwd: currentPath, requirements: true, user: pipScope === 'user' })
      await loadPipPackages()
      addNotification({ type: 'success', message: 'requirements.txt 安装完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '安装 requirements.txt 失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const exportRequirements = async () => {
    try {
      await window.electronAPI.pip.exportRequirements(currentPath)
      addNotification({ type: 'success', message: '已导出 requirements.txt' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '导出 requirements.txt 失败', description: error.message })
    }
  }

  const showRequirements = async () => {
    try {
      const result = await window.electronAPI.pip.readRequirements(currentPath)
      setRequirements(result)
      setRequirementsVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '读取 requirements.txt 失败', description: error.message })
    }
  }

  const updateAllPipPackages = async () => {
    setPipLoading(true)
    try {
      const result = await window.electronAPI.pip.updateAll(getPipOptions())
      setPipOutput(`成功: ${result.success}\n失败: ${result.failed}\n\n${result.output}`)
      setPipOutputVisible(true)
      await loadPipPackages()
      addNotification({ type: 'success', message: 'pip 批量升级完成', description: `成功: ${result.success}, 失败: ${result.failed}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 批量升级失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const showPipDetail = async (packageName: string) => {
    try {
      const detail = await window.electronAPI.pip.show(packageName, currentPath)
      setPipDetail(detail)
      setPipDetailVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '读取 pip 包详情失败', description: error.message })
    }
  }

  const runPipCheck = async () => {
    setPipLoading(true)
    try {
      const output = await window.electronAPI.pip.check(currentPath)
      setPipOutput(output || '未发现依赖冲突')
      setPipOutputVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip check 执行失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const purgePipCache = async () => {
    setPipLoading(true)
    try {
      const output = await window.electronAPI.pip.cachePurge()
      setPipOutput(output)
      setPipOutputVisible(true)
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 缓存已清理' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '清理 pip 缓存失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const savePipConfig = async (values: { key: string; value: string }) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.configSet(pipConfigScope, values.key, values.value)
      setPipConfigVisible(false)
      pipConfigForm.resetFields()
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 配置已保存' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 pip 配置失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const unsetPipConfig = async (key: string) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.configUnset(pipConfigScope, key)
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 配置已删除' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '删除 pip 配置失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const runPipAudit = async () => {
    setPipLoading(true)
    try {
      const result = await window.electronAPI.pip.audit(currentPath)
      setPipAuditIssues(result.issues)
      setPipAuditVisible(true)
      if (result.error) {
        addNotification({ type: 'warning', message: 'pip 安全审计工具不可用', description: result.error })
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 安全审计失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const installPipTool = async (tool: 'pip-audit' | 'pipdeptree') => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.installTool(tool, currentPath)
      addNotification({ type: 'success', message: `${tool} 已安装或升级` })
    } catch (error: any) {
      addNotification({ type: 'error', message: `${tool} 安装失败`, description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const showPipTree = async () => {
    setPipLoading(true)
    try {
      const tree = await window.electronAPI.pip.dependencyTree(currentPath)
      setPipTree(tree)
      setPipTreeVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 pip 依赖树失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const applyPipMirror = async (preset: 'official' | 'tsinghua' | 'aliyun') => {
    const presets = {
      official: { url: 'https://pypi.org/simple', host: 'pypi.org' },
      tsinghua: { url: 'https://pypi.tuna.tsinghua.edu.cn/simple', host: 'pypi.tuna.tsinghua.edu.cn' },
      aliyun: { url: 'https://mirrors.aliyun.com/pypi/simple', host: 'mirrors.aliyun.com' }
    }
    const target = presets[preset]
    setPipLoading(true)
    try {
      await window.electronAPI.pip.configSet('user', 'global.index-url', target.url)
      await window.electronAPI.pip.configSet('user', 'global.trusted-host', target.host)
      setPipConfigScope('user')
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 镜像已设置', description: target.url })
    } catch (error: any) {
      addNotification({ type: 'error', message: '设置 pip 镜像失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const setPipCacheDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    setPipLoading(true)
    try {
      await window.electronAPI.pip.configSet('user', 'global.cache-dir', path)
      setPipConfigScope('user')
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 缓存目录已设置', description: path })
    } catch (error: any) {
      addNotification({ type: 'error', message: '设置 pip 缓存目录失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const searchPipPackages = async (query: string) => {
    if (!query.trim()) {
      setPipSearchOptions([])
      return
    }
    try {
      const results = await window.electronAPI.pip.search(query, currentPath)
      setPipSearchOptions(results.map((item) => ({
        value: item.name,
        label: item.version ? `${item.name} (${item.version})` : item.name
      })))
    } catch {
      setPipSearchOptions([])
    }
  }

  const loadPipVersions = async () => {
    const packageName = pipForm.getFieldValue('packageName')
    if (!packageName) return
    setPipLoading(true)
    try {
      const versions = await window.electronAPI.pip.versions(packageName)
      setPipVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length > 0) {
        pipForm.setFieldValue('version', versions[0])
      }
    } finally {
      setPipLoading(false)
    }
  }

  const backupPipConfig = async () => {
    setPipLoading(true)
    try {
      const backupPath = await window.electronAPI.pip.backupConfig(pipConfigScope)
      addNotification({ type: 'success', message: 'pip 配置已备份', description: backupPath })
    } catch (error: any) {
      addNotification({ type: 'error', message: '备份 pip 配置失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const loadMavenDependencies = async () => {
    setMavenLoading(true)
    try {
      const detected = await window.electronAPI.maven.detect(currentPath)
      if (!detected.hasPom) {
        setMavenDeps([])
        return
      }

      const deps = await window.electronAPI.maven.list(currentPath)
      setMavenDeps(deps)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '读取 Maven 依赖失败',
        description: error.message
      })
    } finally {
      setMavenLoading(false)
    }
  }

  const loadMavenInfo = async () => {
    try {
      const info = await window.electronAPI.maven.info(currentPath)
      setMavenInfo(info)
    } catch {
      setMavenInfo(null)
    }
  }

  const openMavenSettings = async () => {
    try {
      const settingsPath = await window.electronAPI.maven.ensureSettings()
      await window.electronAPI.system.openFile(settingsPath)
      await loadMavenInfo()
    } catch (error: any) {
      addNotification({ type: 'error', message: '打开 Maven settings.xml 失败', description: error.message })
    }
  }

  const setMavenLocalRepository = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return

    setMavenLoading(true)
    try {
      await window.electronAPI.maven.setLocalRepository(path)
      await loadMavenInfo()
      addNotification({ type: 'success', message: 'Maven 本地仓库已更新', description: path })
    } catch (error: any) {
      addNotification({ type: 'error', message: '设置 Maven 本地仓库失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const showEffectiveSettings = async () => {
    setMavenLoading(true)
    setGoalOutputVisible(true)
    setGoalOutput('正在生成 effective settings...')
    try {
      const output = await window.electronAPI.maven.effectiveSettings(currentPath)
      setGoalOutput(output)
    } catch (error: any) {
      setGoalOutput(error.message)
      addNotification({ type: 'error', message: '生成 effective settings 失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const goMavenOffline = async () => {
    setMavenLoading(true)
    setGoalOutputVisible(true)
    setGoalOutput('正在预拉取依赖...')
    try {
      const output = await window.electronAPI.maven.goOffline(currentPath)
      setGoalOutput(output)
      addNotification({ type: 'success', message: 'Maven 离线依赖准备完成' })
    } catch (error: any) {
      setGoalOutput(error.message)
      addNotification({ type: 'error', message: 'Maven 离线依赖准备失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const purgeMavenLocalRepository = async () => {
    setMavenLoading(true)
    setGoalOutputVisible(true)
    setGoalOutput('正在清理当前项目依赖的本地仓库缓存...')
    try {
      const output = await window.electronAPI.maven.purgeLocalRepository(currentPath)
      setGoalOutput(output)
      addNotification({ type: 'success', message: 'Maven 本地仓库缓存已清理' })
    } catch (error: any) {
      setGoalOutput(error.message)
      addNotification({ type: 'error', message: '清理 Maven 本地仓库缓存失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const runMavenSecurityAudit = async () => {
    if (!currentPath) return
    setMavenLoading(true)
    try {
      const result = await window.electronAPI.maven.securityAudit(currentPath)
      setMavenAuditIssues(result.issues)
      setMavenAuditVisible(true)
      if (result.error) {
        addNotification({ type: 'warning', message: 'Maven 安全审计完成但有警告', description: result.error })
      }
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Maven 安全审计失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const applyMavenMirror = async (preset: 'central' | 'aliyun' | 'tencent') => {
    const presets = {
      central: { id: 'central-default', url: 'https://repo.maven.apache.org/maven2', mirrorOf: 'central' },
      aliyun: { id: 'aliyun-central', url: 'https://maven.aliyun.com/repository/public', mirrorOf: 'central' },
      tencent: { id: 'tencent-central', url: 'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/', mirrorOf: 'central' }
    }
    const target = presets[preset]
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.setMirror(target.id, target.url, target.mirrorOf)
      await loadMavenInfo()
      addNotification({ type: 'success', message: 'Maven 镜像已设置', description: target.url })
    } catch (error: any) {
      addNotification({ type: 'error', message: '设置 Maven 镜像失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const searchMavenDependencies = async (query: string) => {
    if (!query.trim()) {
      setMavenSearchOptions([])
      return
    }
    try {
      const results = await window.electronAPI.maven.search(query)
      setMavenSearchOptions(results.map((dep) => ({
        value: `${dep.groupId}:${dep.artifactId}`,
        label: `${dep.groupId}:${dep.artifactId}${dep.latestVersion ? ` (${dep.latestVersion})` : ''}`,
        dep
      })))
    } catch {
      setMavenSearchOptions([])
    }
  }

  const loadMavenVersions = async () => {
    const groupId = mavenForm.getFieldValue('groupId')
    const artifactId = mavenForm.getFieldValue('artifactId')
    if (!groupId || !artifactId) return
    setMavenLoading(true)
    try {
      const versions = await window.electronAPI.maven.versions(groupId, artifactId)
      setMavenVersionOptions(versions.map((version) => ({ value: version, label: version })))
      if (versions.length > 0) {
        mavenForm.setFieldValue('version', versions[0])
      }
    } finally {
      setMavenLoading(false)
    }
  }

  const backupMavenSettings = async () => {
    setMavenLoading(true)
    try {
      const backupPath = await window.electronAPI.maven.backupSettings()
      addNotification({ type: 'success', message: 'Maven settings.xml 已备份', description: backupPath })
    } catch (error: any) {
      addNotification({ type: 'error', message: '备份 Maven settings.xml 失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const executeMavenGoalText = async (goal: string) => {
    await runMavenGoal({ goal })
  }

  const addCustomMavenGoal = () => {
    const value = customGoal.trim()
    if (!value) return
    setCustomMavenGoals((prev) => [value, ...prev.filter((item) => item !== value)])
    setCustomGoal('')
  }

  const moveCustomGoal = (targetGoal: string) => {
    if (!draggedGoal || draggedGoal === targetGoal) return
    setCustomMavenGoals((prev) => {
      const withoutDragged = prev.filter((goal) => goal !== draggedGoal)
      const targetIndex = withoutDragged.indexOf(targetGoal)
      if (targetIndex < 0) return prev
      return [
        ...withoutDragged.slice(0, targetIndex),
        draggedGoal,
        ...withoutDragged.slice(targetIndex)
      ]
    })
    setDraggedGoal(null)
  }

  const addMavenDependency = async (values: MavenDependencyInfo) => {
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.addDependency(currentPath, values)
      setMavenAddVisible(false)
      mavenForm.resetFields()
      await loadMavenDependencies()
      addNotification({ type: 'success', message: 'Maven 依赖已添加' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '添加 Maven 依赖失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const removeMavenDependency = async (dep: MavenDependencyInfo) => {
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.removeDependency(currentPath, {
        groupId: dep.groupId,
        artifactId: dep.artifactId
      })
      await loadMavenDependencies()
      addNotification({ type: 'success', message: 'Maven 依赖已移除' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '移除 Maven 依赖失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const runMavenGoal = async (values: { goal: string }) => {
    setMavenLoading(true)
    setGoalOutputVisible(true)
    setGoalOutput('正在执行...')
    try {
      const output = await window.electronAPI.maven.runGoal(currentPath, values.goal)
      setGoalOutput(output)
      setGoalVisible(false)
      addNotification({ type: 'success', message: `mvn ${values.goal} 执行完成` })
    } catch (error: any) {
      setGoalOutput(error.message)
      addNotification({ type: 'error', message: 'Maven 命令执行失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const showMavenTree = async () => {
    setMavenLoading(true)
    setGoalOutputVisible(true)
    setGoalOutput('正在生成依赖树...')
    try {
      const output = await window.electronAPI.maven.tree(currentPath)
      setGoalOutput(output)
    } catch (error: any) {
      setGoalOutput(error.message)
      addNotification({ type: 'error', message: '生成 Maven 依赖树失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const pipColumns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (text: string, record: any) => (
        <Space>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => showPipDetail(text)}>
            {text}
          </Button>
          {record.outdated && (
            <Tooltip title="有新版本可用">
              <WarningOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: '当前版本',
      dataIndex: 'version',
      key: 'version',
      width: 140,
      render: (text: string) => <Tag>{text}</Tag>
    },
    {
      title: '最新版本',
      dataIndex: 'latest',
      key: 'latest',
      width: 140,
      render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 190,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="详情">
            <Button size="small" icon={<CodeOutlined />} onClick={() => showPipDetail(record.name)} />
          </Tooltip>
          <Tooltip title="升级">
            <Button size="small" icon={<SyncOutlined />} onClick={() => updatePipPackage(record.name)} />
          </Tooltip>
          <Popconfirm title={`卸载 ${record.name}?`} onConfirm={() => uninstallPipPackage(record.name)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const mavenColumns = [
    {
      title: 'Group',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 260
    },
    {
      title: 'Artifact',
      dataIndex: 'artifactId',
      key: 'artifactId',
      width: 220
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 150,
      render: (text: string) => text ? <Tag>{text}</Tag> : <Tag color="orange">继承/变量</Tag>
    },
    {
      title: 'Scope',
      dataIndex: 'scope',
      key: 'scope',
      width: 120,
      render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_: any, record: MavenDependencyInfo) => (
        <Popconfirm title={`移除 ${record.artifactId}?`} onConfirm={() => removeMavenDependency(record)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>包管理器</h2>
          <Segmented
            value={activeManager}
            onChange={(value) => {
              const next = value as 'pip' | 'maven'
              setActiveManager(next)
              navigate(next === 'pip' ? '/pip' : '/maven')
            }}
            options={[
              { label: 'Python pip', value: 'pip' },
              { label: 'Java Maven', value: 'maven' }
            ]}
          />
        </div>
        <div className={styles.actions}>
          <span className={styles.pathInfo}>
            <span className={styles.pathLabel}>项目路径:</span>
            <span className={styles.pathValue}>{currentPath}</span>
          </span>
          <Button icon={<FolderOpenOutlined />} onClick={handleSelectDirectory}>
            选择目录
          </Button>
        </div>
      </div>

      <Tabs activeKey={activeManager} onChange={(key: string) => {
        const next = key as 'pip' | 'maven'
        setActiveManager(next)
        navigate(next === 'pip' ? '/pip' : '/maven')
      }} items={[
        {
          key: 'pip',
          label: 'Python pip',
          children: (
            <div className={styles.panel}>
              <div className={styles.scopeRow}>
                <Segmented
                  value={pipScope}
                  onChange={(value) => setPipScope(value as 'environment' | 'user')}
                  options={[
                    { label: '当前环境', value: 'environment' },
                    { label: '用户全局', value: 'user' }
                  ]}
                />
                <span className={styles.metaText}>缓存: {pipCacheDir || '未检测到'}</span>
              </div>
              <div className={styles.toolbar}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setPipInstallVisible(true)}>
                  安装包
                </Button>
                <Button icon={<SyncOutlined />} onClick={updateAllPipPackages} disabled={pipRows.every((pkg) => !pkg.outdated)}>
                  升级全部
                </Button>
                <Button icon={<DownloadOutlined />} onClick={installRequirements} disabled={!currentPath}>
                  安装 requirements.txt
                </Button>
                <Button icon={<ExportOutlined />} onClick={exportRequirements} disabled={!currentPath}>
                  导出 requirements.txt
                </Button>
                <Button icon={<CodeOutlined />} onClick={showRequirements} disabled={!currentPath}>
                  查看 requirements
                </Button>
                <Button icon={<CheckCircleOutlined />} onClick={runPipCheck}>
                  依赖检查
                </Button>
                <Button icon={<SecurityScanOutlined />} onClick={runPipAudit}>
                  安全审计
                </Button>
                <Button icon={<ApartmentOutlined />} onClick={showPipTree}>
                  依赖树
                </Button>
                <Button icon={<DeleteOutlined />} onClick={purgePipCache}>
                  清理缓存
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadPipPackages} loading={pipLoading}>
                  刷新
                </Button>
              </div>
              <Spin spinning={pipLoading}>
                {pipRows.length === 0 ? (
                  <Empty description="暂无 pip 包，或当前环境未安装 pip" />
                ) : (
                  <Table dataSource={pipRows} columns={pipColumns} rowKey="name" size="small" pagination={{ pageSize: 20 }} />
                )}
              </Spin>
              <div className={styles.quickPanel}>
                <div className={styles.subPanelHeader}>
                  <Space>
                    <SettingOutlined />
                    <span>pip 设置管理</span>
                  </Space>
                  <Button size="small" onClick={backupPipConfig}>备份配置</Button>
                </div>
                <Collapse
                  size="small"
                  ghost
                  items={[
                    {
                      key: 'mirror',
                      label: '镜像源',
                      children: (
                        <Segmented
                          value={pipMirror}
                          onChange={(value) => {
                            const next = value as 'official' | 'tsinghua' | 'aliyun'
                            setPipMirror(next)
                            applyPipMirror(next)
                          }}
                          options={[
                            { label: '官方 PyPI', value: 'official' },
                            { label: '清华镜像', value: 'tsinghua' },
                            { label: '阿里云镜像', value: 'aliyun' }
                          ]}
                        />
                      )
                    },
                    {
                      key: 'paths',
                      label: '存储与插件',
                      children: (
                        <Space wrap>
                          <Button size="small" icon={<FolderOpenOutlined />} onClick={setPipCacheDirectory}>选择缓存目录</Button>
                          <Button size="small" icon={<SecurityScanOutlined />} onClick={() => installPipTool('pip-audit')}>安装/升级 pip-audit</Button>
                          <Button size="small" icon={<ApartmentOutlined />} onClick={() => installPipTool('pipdeptree')}>安装/升级 pipdeptree</Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </div>
              <div className={styles.subPanel}>
                <div className={styles.subPanelHeader}>
                  <Space>
                    <SettingOutlined />
                    <span>pip 配置</span>
                    <Select
                      size="small"
                      value={pipConfigScope}
                      onChange={setPipConfigScope}
                      style={{ width: 100 }}
                      options={[
                        { label: '用户', value: 'user' },
                        { label: '全局', value: 'global' },
                        { label: '站点', value: 'site' }
                      ]}
                    />
                  </Space>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setPipConfigVisible(true)}>
                    添加配置
                  </Button>
                </div>
                <Table
                  dataSource={pipConfig}
                  columns={[
                    { title: '配置项', dataIndex: 'key', key: 'key', width: 260 },
                    { title: '值', dataIndex: 'value', key: 'value', ellipsis: true },
                    {
                      title: '操作',
                      key: 'action',
                      width: 80,
                      render: (_: any, record: PipConfigItem) => (
                        <Popconfirm title={`删除 ${record.key}?`} onConfirm={() => unsetPipConfig(record.key)}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )
                    }
                  ]}
                  rowKey="key"
                  size="small"
                  pagination={false}
                />
              </div>
            </div>
          )
        },
        {
          key: 'maven',
          label: 'Java Maven',
          children: (
            <div className={styles.panel}>
              <Descriptions size="small" column={1} bordered className={styles.infoPanel}>
                <Descriptions.Item label="Maven">
                  <span className={styles.multiLineValue}>{mavenInfo?.version?.split(/\r?\n/)[0] || '未检测到'}</span>
                </Descriptions.Item>
                <Descriptions.Item label="本地仓库">
                  <Space>
                    <span className={styles.pathValue}>{mavenInfo?.localRepository || '-'}</span>
                    {mavenInfo?.localRepository && (
                      <Button size="small" icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.system.openPath(mavenInfo.localRepository)}>
                        打开
                      </Button>
                    )}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="settings.xml">
                  <Space>
                    <span className={styles.pathValue}>{mavenInfo?.settingsPath || '-'}</span>
                    <Tag color={mavenInfo?.hasSettings ? 'green' : 'orange'}>{mavenInfo?.hasSettings ? '已存在' : '未创建'}</Tag>
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <div className={styles.toolbar}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setMavenAddVisible(true)} disabled={!currentPath}>
                  添加依赖
                </Button>
                <Button icon={<ApartmentOutlined />} onClick={showMavenTree} disabled={!currentPath}>
                  依赖树
                </Button>
                <Button icon={<SecurityScanOutlined />} onClick={runMavenSecurityAudit} disabled={!currentPath}>
                  安全审计
                </Button>
                <Button icon={<CodeOutlined />} onClick={() => setGoalVisible(true)} disabled={!currentPath}>
                  执行 Maven Goal
                </Button>
                <Button icon={<SettingOutlined />} onClick={openMavenSettings}>
                  打开 settings.xml
                </Button>
                <Button icon={<FolderOpenOutlined />} onClick={setMavenLocalRepository}>
                  设置本地仓库
                </Button>
                <Button icon={<CodeOutlined />} onClick={showEffectiveSettings}>
                  Effective Settings
                </Button>
                <Button icon={<DownloadOutlined />} onClick={goMavenOffline} disabled={!currentPath}>
                  离线依赖
                </Button>
                <Button icon={<DeleteOutlined />} onClick={purgeMavenLocalRepository} disabled={!currentPath}>
                  清理项目缓存
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadMavenDependencies} loading={mavenLoading} disabled={!currentPath}>
                  刷新
                </Button>
              </div>
              <div className={styles.quickPanel}>
                <div className={styles.subPanelHeader}>
                  <Space>
                    <SettingOutlined />
                    <span>Maven 设置管理</span>
                  </Space>
                  <Button size="small" onClick={backupMavenSettings}>备份 settings.xml</Button>
                </div>
                <Collapse
                  size="small"
                  ghost
                  items={[
                    {
                      key: 'mirror',
                      label: '镜像源',
                      children: (
                        <Segmented
                          value={mavenMirror}
                          onChange={(value) => {
                            const next = value as 'central' | 'aliyun' | 'tencent'
                            setMavenMirror(next)
                            applyMavenMirror(next)
                          }}
                          options={[
                            { label: '官方 Central', value: 'central' },
                            { label: '阿里云', value: 'aliyun' },
                            { label: '腾讯云', value: 'tencent' }
                          ]}
                        />
                      )
                    },
                    {
                      key: 'paths',
                      label: '仓库与安全插件',
                      children: (
                        <Space wrap>
                          <Button size="small" icon={<FolderOpenOutlined />} onClick={setMavenLocalRepository}>选择本地仓库</Button>
                          <Button size="small" icon={<SecurityScanOutlined />} onClick={runMavenSecurityAudit} disabled={!currentPath}>运行 OWASP 检查</Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </div>
              <div className={styles.scriptPanel}>
                <div className={styles.subPanelHeader}>
                  <Space>
                    <CodeOutlined />
                    <span>Maven 常用命令</span>
                  </Space>
                  <Space.Compact>
                    <Input size="small" value={customGoal} onChange={(event) => setCustomGoal(event.target.value)} placeholder="自定义 goal" />
                    <Button size="small" onClick={addCustomMavenGoal}>添加</Button>
                  </Space.Compact>
                </div>
                <div className={styles.scriptButtons}>
                  {mavenGoalButtons.map((goal) => (
                    <Button
                      key={goal}
                      draggable={customMavenGoals.includes(goal)}
                      onDragStart={() => setDraggedGoal(goal)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => moveCustomGoal(goal)}
                      size="small"
                      type={customMavenGoals.includes(goal) ? 'primary' : 'default'}
                      onClick={() => executeMavenGoalText(goal)}
                    >
                      {goal}
                    </Button>
                  ))}
                </div>
              </div>
              <Spin spinning={mavenLoading}>
                {mavenDeps.length === 0 ? (
                  <Empty description="未检测到 pom.xml，或当前 Maven 项目暂无依赖" />
                ) : (
                  <Table
                    dataSource={mavenDeps}
                    columns={mavenColumns}
                    rowKey={(record) => `${record.groupId}:${record.artifactId}:${record.version || ''}:${record.scope || ''}`}
                    size="small"
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 900 }}
                  />
                )}
              </Spin>
            </div>
          )
        }
      ].filter((item) => item.key === activeManager)} />

      <Modal
        title="安装 pip 包"
        open={pipInstallVisible}
        onCancel={() => setPipInstallVisible(false)}
        onOk={() => pipForm.submit()}
        okText="安装"
        cancelText="取消"
      >
        <Form form={pipForm} layout="vertical" onFinish={installPipPackage} initialValues={{ upgrade: 'false' }}>
          <Form.Item name="packageName" label="包名" rules={[{ required: true, message: '请输入包名' }]}>
            <AutoComplete
              options={pipSearchOptions}
              onSearch={searchPipPackages}
              onSelect={(value) => pipForm.setFieldValue('packageName', value)}
              placeholder="例如: requests"
            />
          </Form.Item>
          <Form.Item label="版本（可选）">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle>
                <AutoComplete
                  options={pipVersionOptions}
                  placeholder="默认 latest，或选择最近 10 个版本"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Button onClick={loadPipVersions}>获取版本</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="upgrade" label="安装时升级">
            <Select
              options={[
                { label: '否', value: 'false' },
                { label: '是', value: 'true' }
              ]}
            />
          </Form.Item>
          <Form.Item name="indexUrl" label="Index URL（可选）">
            <Input placeholder="例如: https://pypi.org/simple" />
          </Form.Item>
          <Form.Item name="extraIndexUrl" label="Extra Index URL（可选）">
            <Input placeholder="额外索引地址" />
          </Form.Item>
          <Form.Item name="trustedHost" label="Trusted Host（可选）">
            <Input placeholder="例如: pypi.org" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="requirements.txt"
        open={requirementsVisible}
        onCancel={() => setRequirementsVisible(false)}
        footer={null}
      >
        <div className={styles.requirements}>
          {requirements.length === 0 ? (
            <Empty description="未找到 requirements.txt 或文件为空" />
          ) : (
            requirements.map((item) => <Tag key={item} style={{ marginBottom: 8 }}>{item}</Tag>)
          )}
        </div>
      </Modal>

      <Modal
        title="添加 pip 配置"
        open={pipConfigVisible}
        onCancel={() => setPipConfigVisible(false)}
        onOk={() => pipConfigForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={pipConfigForm} layout="vertical" onFinish={savePipConfig}>
          <Form.Item name="key" label="配置项" rules={[{ required: true, message: '请输入配置项' }]}>
            <Input placeholder="例如: global.index-url" />
          </Form.Item>
          <Form.Item name="value" label="值" rules={[{ required: true, message: '请输入配置值' }]}>
            <Input placeholder="例如: https://pypi.org/simple" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="pip 包详情"
        open={pipDetailVisible}
        onCancel={() => setPipDetailVisible(false)}
        footer={null}
        width={700}
      >
        {pipDetail ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="名称">{pipDetail.name}</Descriptions.Item>
            <Descriptions.Item label="版本">{pipDetail.version}</Descriptions.Item>
            <Descriptions.Item label="摘要">{pipDetail.summary || '-'}</Descriptions.Item>
            <Descriptions.Item label="主页">{pipDetail.homePage || '-'}</Descriptions.Item>
            <Descriptions.Item label="作者">{pipDetail.author || '-'}</Descriptions.Item>
            <Descriptions.Item label="许可证">{pipDetail.license || '-'}</Descriptions.Item>
            <Descriptions.Item label="位置">{pipDetail.location || '-'}</Descriptions.Item>
            <Descriptions.Item label="依赖">{pipDetail.requires || '-'}</Descriptions.Item>
            <Descriptions.Item label="被依赖">{pipDetail.requiredBy || '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="未找到包详情" />
        )}
      </Modal>

      <Modal
        title="pip 输出"
        open={pipOutputVisible}
        onCancel={() => setPipOutputVisible(false)}
        footer={null}
        width={800}
      >
        <pre className={styles.output}>{pipOutput}</pre>
      </Modal>

      <Modal
        title="pip 安全审计"
        open={pipAuditVisible}
        onCancel={() => setPipAuditVisible(false)}
        footer={null}
        width={900}
      >
        {pipAuditIssues.length === 0 ? (
          <Empty description="未发现安全问题，或 pip-audit 尚未安装" />
        ) : (
          <Table
            dataSource={pipAuditIssues}
            rowKey={(record) => `${record.name}:${record.id}`}
            size="small"
            pagination={{ pageSize: 8 }}
            columns={[
              { title: '包名', dataIndex: 'name', key: 'name', width: 160 },
              { title: '版本', dataIndex: 'version', key: 'version', width: 110 },
              { title: '漏洞编号', dataIndex: 'id', key: 'id', width: 150, render: (text: string) => <Tag color="red">{text}</Tag> },
              { title: '问题说明', dataIndex: 'description', key: 'description', ellipsis: true },
              { title: '修复版本', dataIndex: 'fixVersions', key: 'fixVersions', width: 180, render: (items: string[]) => items?.length ? items.map((item) => <Tag key={item} color="green">{item}</Tag>) : '-' }
            ]}
          />
        )}
      </Modal>

      <Modal
        title="pip 依赖树"
        open={pipTreeVisible}
        onCancel={() => setPipTreeVisible(false)}
        footer={null}
        width={900}
      >
        <pre className={styles.output}>{JSON.stringify(pipTree, null, 2)}</pre>
      </Modal>

      <Modal
        title="添加 Maven 依赖"
        open={mavenAddVisible}
        onCancel={() => setMavenAddVisible(false)}
        onOk={() => mavenForm.submit()}
        okText="添加"
        cancelText="取消"
      >
        <Form form={mavenForm} layout="vertical" onFinish={addMavenDependency}>
          <Form.Item name="groupId" label="groupId" rules={[{ required: true, message: '请输入 groupId' }]}>
            <AutoComplete
              options={mavenSearchOptions}
              onSearch={searchMavenDependencies}
              onSelect={(_, option) => {
                const dep = (option as any).dep as MavenSearchResult
                mavenForm.setFieldsValue({
                  groupId: dep.groupId,
                  artifactId: dep.artifactId,
                  version: dep.latestVersion || dep.version
                })
                setMavenVersionOptions(dep.latestVersion ? [{ value: dep.latestVersion, label: dep.latestVersion }] : [])
              }}
              placeholder="输入 groupId、artifactId 或关键字搜索"
            />
          </Form.Item>
          <Form.Item name="artifactId" label="artifactId" rules={[{ required: true, message: '请输入 artifactId' }]}>
            <AutoComplete
              options={mavenSearchOptions}
              onSearch={searchMavenDependencies}
              onSelect={(_, option) => {
                const dep = (option as any).dep as MavenSearchResult
                mavenForm.setFieldsValue({
                  groupId: dep.groupId,
                  artifactId: dep.artifactId,
                  version: dep.latestVersion || dep.version
                })
                setMavenVersionOptions(dep.latestVersion ? [{ value: dep.latestVersion, label: dep.latestVersion }] : [])
              }}
              placeholder="例如: commons-lang3"
            />
          </Form.Item>
          <Form.Item label="version" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="version" noStyle rules={[{ required: true, message: '请输入 version' }]}>
                <AutoComplete
                  options={mavenVersionOptions}
                  placeholder="选择最近 10 个版本或手动输入"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Button onClick={loadMavenVersions}>获取版本</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="scope" label="scope">
            <Select allowClear placeholder="默认 compile">
              <Select.Option value="compile">compile</Select.Option>
              <Select.Option value="provided">provided</Select.Option>
              <Select.Option value="runtime">runtime</Select.Option>
              <Select.Option value="test">test</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="执行 Maven Goal"
        open={goalVisible}
        onCancel={() => setGoalVisible(false)}
        onOk={() => goalForm.submit()}
        okText="执行"
        cancelText="取消"
      >
        <Form form={goalForm} layout="vertical" onFinish={runMavenGoal} initialValues={{ goal: 'test' }}>
          <Form.Item name="goal" label="Goal" rules={[{ required: true, message: '请输入 Maven goal' }]}>
            <Select showSearch options={COMMON_MAVEN_GOALS.map((goal) => ({ label: goal, value: goal }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="命令输出"
        open={goalOutputVisible}
        onCancel={() => setGoalOutputVisible(false)}
        footer={null}
        width={800}
      >
        <pre className={styles.output}>{goalOutput}</pre>
      </Modal>

      <Modal
        title="Maven 安全审计"
        open={mavenAuditVisible}
        onCancel={() => setMavenAuditVisible(false)}
        footer={null}
        width={980}
      >
        {mavenAuditIssues.length === 0 ? (
          <Empty description="未发现安全问题，或 OWASP dependency-check 未返回报告" />
        ) : (
          <Table
            dataSource={mavenAuditIssues}
            rowKey={(record, index) => `${record.dependency}:${record.name}:${index}`}
            size="small"
            pagination={{ pageSize: 8 }}
            columns={[
              { title: '依赖', dataIndex: 'dependency', key: 'dependency', width: 220, ellipsis: true },
              { title: '严重程度', dataIndex: 'severity', key: 'severity', width: 110, render: (text: string) => <Tag color={text === 'CRITICAL' || text === 'HIGH' ? 'red' : 'orange'}>{text}</Tag> },
              { title: '漏洞', dataIndex: 'name', key: 'name', width: 160 },
              { title: '问题说明', dataIndex: 'description', key: 'description', ellipsis: true },
              { title: '操作', key: 'action', width: 100, render: (_: any, record: MavenAuditIssue) => record.url ? <Button size="small" type="link" onClick={() => window.electronAPI.openExternal(record.url!)}>详情</Button> : null }
            ]}
          />
        )}
      </Modal>
    </div>
  )
}

export default MultiManagerPage
