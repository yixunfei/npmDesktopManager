import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AutoComplete, Button, Collapse, Descriptions, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Table, Tabs, Tag, Tooltip } from 'antd'
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SecurityScanOutlined,
  SwapOutlined,
  SyncOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { DependencyTreeViewer } from '../../components/Package/DependencyTreeViewer'
import { DependencyHealthModal } from '../../components/Package/DependencyHealthModal'
import ProjectPage from '../Project/Project'
import GlobalPage from '../Global/Global'
import PublishPage from '../Publish/Publish'
import ProjectPathBar from '../../components/ProjectPathBar/ProjectPathBar'
import RuntimeManagerSwitch from '../../components/ManagerSwitch/RuntimeManagerSwitch'
import { useDependencyHealthReminder } from '../../hooks/useDependencyHealthReminder'
import styles from './MultiManager.module.css'

type ManagerType = 'npm' | 'pip' | 'maven'

const MANAGER_ROUTES: Record<ManagerType, string> = {
  npm: '/npm',
  pip: '/pip',
  maven: '/maven'
}

const COMMON_MAVEN_GOALS = ['clean', 'compile', 'test', 'package', 'install', 'clean package', 'dependency:tree']
const PIP_CONFIG_KEY_OPTIONS = [
  { value: 'global.index-url', label: 'global.index-url（主镜像源）' },
  { value: 'global.extra-index-url', label: 'global.extra-index-url（额外镜像源）' },
  { value: 'global.trusted-host', label: 'global.trusted-host（可信主机）' },
  { value: 'global.cache-dir', label: 'global.cache-dir（缓存目录）' },
  { value: 'global.timeout', label: 'global.timeout（超时秒数）' },
  { value: 'global.proxy', label: 'global.proxy（代理）' }
]
const PIP_CONFIG_VALUE_OPTIONS = [
  { value: 'https://pypi.org/simple', label: 'PyPI 官方' },
  { value: 'https://pypi.tuna.tsinghua.edu.cn/simple', label: '清华 PyPI' },
  { value: 'https://mirrors.aliyun.com/pypi/simple', label: '阿里云 PyPI' },
  { value: 'pypi.org', label: 'pypi.org' },
  { value: 'pypi.tuna.tsinghua.edu.cn', label: 'pypi.tuna.tsinghua.edu.cn' },
  { value: 'mirrors.aliyun.com', label: 'mirrors.aliyun.com' }
]
const PIP_REPOSITORY_OPTIONS = [
  { value: 'https://upload.pypi.org/legacy/', label: 'PyPI 官方' },
  { value: 'https://test.pypi.org/legacy/', label: 'Test PyPI' }
]
const MAVEN_REPOSITORY_OPTIONS = [
  { value: 'https://repo.maven.apache.org/maven2', label: 'Maven Central' },
  { value: 'https://maven.aliyun.com/repository/public', label: '阿里云公共仓库' },
  { value: 'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/', label: '腾讯云公共仓库' },
  { value: 'https://s01.oss.sonatype.org/service/local/staging/deploy/maven2/', label: 'Sonatype OSSRH Release' },
  { value: 'https://s01.oss.sonatype.org/content/repositories/snapshots/', label: 'Sonatype OSSRH Snapshot' },
  { value: 'https://packages.aliyun.com/maven/repository', label: '阿里云 Packages' },
  { value: 'https://maven.pkg.github.com/owner/repository', label: 'GitHub Packages' }
]

function normalizePackageKey(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

function toMavenSearchOptions(deps: MavenSearchResult[], field: 'groupId' | 'artifactId') {
  return deps.map((dep) => {
    const version = dep.latestVersion || dep.version
    const source = dep.description ? ` · ${dep.description}` : ''
    return {
      value: field === 'groupId' ? dep.groupId : dep.artifactId,
      label: `${dep.groupId}:${dep.artifactId}${version ? ` (${version})` : ''}${source}`,
      dep
    }
  })
}

interface MultiManagerPageProps {
  initialManager?: ManagerType
}

const MultiManagerPage: React.FC<MultiManagerPageProps> = ({ initialManager = 'npm' }) => {
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
  const [pipVersionVisible, setPipVersionVisible] = useState(false)
  const [pipSelectedPackage, setPipSelectedPackage] = useState<PipPackageInfo | null>(null)
  const [pipRepairVisible, setPipRepairVisible] = useState(false)
  const [pipRepairOutput, setPipRepairOutput] = useState('')
  const [pipHealthVisible, setPipHealthVisible] = useState(false)
  const [pipSearchOptions, setPipSearchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [pipVersionOptions, setPipVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [pipMirror, setPipMirror] = useState<'official' | 'tsinghua' | 'aliyun' | 'custom'>('official')
  const [pipMirrorVisible, setPipMirrorVisible] = useState(false)
  const [pipMirrorForm] = Form.useForm()
  const [pipPublishVisible, setPipPublishVisible] = useState(false)
  const [pipPublishForm] = Form.useForm()
  const [pipForm] = Form.useForm()
  const [pipConfigForm] = Form.useForm()

  const [mavenDeps, setMavenDeps] = useState<MavenDependencyInfo[]>([])
  const [mavenLatestMap, setMavenLatestMap] = useState<Record<string, string>>({})
  const [mavenInfo, setMavenInfo] = useState<MavenGlobalInfo | null>(null)
  const [mavenLoading, setMavenLoading] = useState(false)
  const [mavenAddVisible, setMavenAddVisible] = useState(false)
  const [goalVisible, setGoalVisible] = useState(false)
  const [goalOutputVisible, setGoalOutputVisible] = useState(false)
  const [goalOutput, setGoalOutput] = useState('')
  const [mavenAuditVisible, setMavenAuditVisible] = useState(false)
  const [mavenAuditIssues, setMavenAuditIssues] = useState<MavenAuditIssue[]>([])
  const [mavenTreeVisible, setMavenTreeVisible] = useState(false)
  const [mavenTree, setMavenTree] = useState<any>(null)
  const [mavenHealthVisible, setMavenHealthVisible] = useState(false)
  const [mavenVersionVisible, setMavenVersionVisible] = useState(false)
  const [mavenSelectedDep, setMavenSelectedDep] = useState<MavenDependencyInfo | null>(null)
  const [mavenPublishVisible, setMavenPublishVisible] = useState(false)
  const [mavenPublishForm] = Form.useForm()
  const [mavenMirrorVisible, setMavenMirrorVisible] = useState(false)
  const [mavenMirrorForm] = Form.useForm()
  const [mavenServerVisible, setMavenServerVisible] = useState(false)
  const [mavenServerForm] = Form.useForm()
  const [mavenSearchResults, setMavenSearchResults] = useState<MavenSearchResult[]>([])
  const [mavenVersionOptions, setMavenVersionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [mavenMirror, setMavenMirror] = useState<'central' | 'aliyun' | 'tencent' | 'custom'>('central')
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
  const [activeManager, setActiveManager] = useState<ManagerType>(initialManager)
  const [projectInfo, setProjectInfo] = useState<any>(null)

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

  const mavenGroupOptions = useMemo(() => toMavenSearchOptions(mavenSearchResults, 'groupId'), [mavenSearchResults])
  const mavenArtifactOptions = useMemo(() => toMavenSearchOptions(mavenSearchResults, 'artifactId'), [mavenSearchResults])

  useDependencyHealthReminder('pip', currentPath, activeManager === 'pip' && !!currentPath && pipRows.length > 0)
  useDependencyHealthReminder('maven', currentPath, activeManager === 'maven' && !!currentPath && mavenDeps.length > 0)

  const detectedManagers = useMemo<ManagerType[]>(() => {
    if (!projectInfo) return []
    const result: ManagerType[] = []
    if (projectInfo.hasPackageJson) result.push('npm')
    if (projectInfo.hasRequirementsTxt) result.push('pip')
    if (projectInfo.hasPomXml) result.push('maven')
    return result
  }, [projectInfo])

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

  useEffect(() => {
    loadProjectInfo()
  }, [currentPath])

  const loadProjectInfo = async () => {
    if (!currentPath) {
      setProjectInfo(null)
      return
    }
    try {
      const info = await window.electronAPI.project.detect(currentPath)
      setProjectInfo(info)
    } catch {
      setProjectInfo(null)
    }
  }

  const switchManager = (manager: ManagerType) => {
    setActiveManager(manager)
    navigate(MANAGER_ROUTES[manager])
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

  const repairPipCheck = async () => {
    setPipLoading(true)
    try {
      const result = await window.electronAPI.pip.repairCheck(currentPath)
      setPipRepairOutput(result.output)
      setPipRepairVisible(true)
      setPipOutput(result.output)
      setPipOutputVisible(true)
      if (result.success > 0) {
        await loadPipPackages()
      }
      addNotification({
        type: result.failed > 0 ? 'warning' : 'success',
        message: 'pip 依赖自修复完成',
        description: `处理 ${result.actions.length} 项，成功 ${result.success} 项`
      })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 依赖自修复失败', description: error.message })
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

  const applyPipMirror = async (preset: 'official' | 'tsinghua' | 'aliyun' | 'custom') => {
    if (preset === 'custom') {
      pipMirrorForm.setFieldsValue({
        indexUrl: 'https://pypi.org/simple',
        trustedHost: 'pypi.org'
      })
      setPipMirrorVisible(true)
      return
    }

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

  const saveCustomPipMirror = async (values: { indexUrl: string; trustedHost: string }) => {
    setPipLoading(true)
    try {
      await window.electronAPI.pip.configSet('user', 'global.index-url', values.indexUrl)
      if (values.trustedHost) {
        await window.electronAPI.pip.configSet('user', 'global.trusted-host', values.trustedHost)
      }
      setPipMirror('custom')
      setPipMirrorVisible(false)
      pipMirrorForm.resetFields()
      await loadPipTooling()
      addNotification({ type: 'success', message: 'pip 自定义镜像已保存', description: values.indexUrl })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 pip 自定义镜像失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const publishPipPackage = async (values: { repositoryUrl?: string; username?: string; password?: string; buildBefore?: boolean | string }) => {
    setPipLoading(true)
    try {
      const output = await window.electronAPI.pip.publish({
        cwd: currentPath,
        repositoryUrl: values.repositoryUrl,
        username: values.username,
        password: values.password,
        buildBefore: values.buildBefore !== false && values.buildBefore !== 'false'
      })
      setPipOutput(output)
      setPipOutputVisible(true)
      setPipPublishVisible(false)
      pipPublishForm.resetFields()
      addNotification({ type: 'success', message: 'pip 发布完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 发布失败', description: error.message })
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

  const showPipVersions = async (pkg: PipPackageInfo) => {
    setPipSelectedPackage(pkg)
    setPipLoading(true)
    try {
      const versions = await window.electronAPI.pip.versions(pkg.name)
      setPipVersionOptions(versions.map((version) => ({ value: version, label: version })))
      setPipVersionVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '获取 pip 版本失败', description: error.message })
    } finally {
      setPipLoading(false)
    }
  }

  const installPipVersion = async (version: string) => {
    if (!pipSelectedPackage) return
    setPipLoading(true)
    try {
      await window.electronAPI.pip.install({
        packageName: pipSelectedPackage.name,
        version,
        cwd: currentPath,
        user: pipScope === 'user',
        upgrade: true
      })
      setPipVersionVisible(false)
      await loadPipPackages()
      addNotification({ type: 'success', message: 'pip 版本切换成功', description: `${pipSelectedPackage.name}@${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'pip 版本切换失败', description: error.message })
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
        setMavenLatestMap({})
        return
      }

      const deps = await window.electronAPI.maven.list(currentPath)
      setMavenDeps(deps)
      const latestEntries = await Promise.all(
        deps.slice(0, 20).map(async (dep) => {
          try {
            const versions = await window.electronAPI.maven.versions(dep.groupId, dep.artifactId)
            return [`${dep.groupId}:${dep.artifactId}`, versions[0] || dep.version] as const
          } catch {
            return [`${dep.groupId}:${dep.artifactId}`, dep.version] as const
          }
        })
      )
      setMavenLatestMap(Object.fromEntries(latestEntries))
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

  const showMavenTree = async () => {
    setMavenLoading(true)
    try {
      const tree = await window.electronAPI.maven.dependencyTree(currentPath)
      setMavenTree(tree)
      setMavenTreeVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '生成 Maven 依赖树失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const applyMavenMirror = async (preset: 'central' | 'aliyun' | 'tencent' | 'custom') => {
    if (preset === 'custom') {
      mavenMirrorForm.setFieldsValue({
        id: 'custom-central',
        url: 'https://repo.maven.apache.org/maven2',
        mirrorOf: 'central'
      })
      setMavenMirrorVisible(true)
      return
    }

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

  const saveCustomMavenMirror = async (values: { id: string; url: string; mirrorOf?: string }) => {
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.setMirror(values.id, values.url, values.mirrorOf || 'central')
      setMavenMirror('custom')
      setMavenMirrorVisible(false)
      mavenMirrorForm.resetFields()
      await loadMavenInfo()
      addNotification({ type: 'success', message: 'Maven 自定义镜像已保存', description: values.url })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 Maven 自定义镜像失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const saveMavenServer = async (values: { id: string; username: string; password: string }) => {
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.setServer(values.id, values.username, values.password)
      setMavenServerVisible(false)
      mavenServerForm.resetFields()
      addNotification({ type: 'success', message: 'Maven 远程仓库凭据已保存' })
    } catch (error: any) {
      addNotification({ type: 'error', message: '保存 Maven 远程仓库凭据失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const publishMavenPackage = async (values: { repositoryId?: string; repositoryUrl?: string; skipTests?: boolean | string; goals?: string }) => {
    setMavenLoading(true)
    try {
      const output = await window.electronAPI.maven.deploy({
        cwd: currentPath,
        repositoryId: values.repositoryId,
        repositoryUrl: values.repositoryUrl,
        skipTests: values.skipTests === true || values.skipTests === 'true',
        goals: values.goals
      })
      setGoalOutput(output)
      setGoalOutputVisible(true)
      setMavenPublishVisible(false)
      mavenPublishForm.resetFields()
      addNotification({ type: 'success', message: 'Maven 发布完成' })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Maven 发布失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const searchMavenDependencies = async (query: string, scope: MavenSearchScope = 'artifactId') => {
    if (!query.trim()) {
      setMavenSearchResults([])
      return
    }
    try {
      const results = await window.electronAPI.maven.search(query, currentPath, {
        mode: 'startsWith',
        scope,
        source: 'mavenCentral',
        includeLocal: false
      })
      setMavenSearchResults(results)
    } catch {
      setMavenSearchResults([])
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

  const showMavenVersions = async (dep: MavenDependencyInfo) => {
    setMavenSelectedDep(dep)
    setMavenLoading(true)
    try {
      const versions = await window.electronAPI.maven.versions(dep.groupId, dep.artifactId)
      setMavenVersionOptions(versions.map((version) => ({ value: version, label: version })))
      setMavenVersionVisible(true)
    } catch (error: any) {
      addNotification({ type: 'error', message: '获取 Maven 版本失败', description: error.message })
    } finally {
      setMavenLoading(false)
    }
  }

  const installMavenVersion = async (version: string) => {
    if (!mavenSelectedDep) return
    setMavenLoading(true)
    try {
      await window.electronAPI.maven.addDependency(currentPath, {
        ...mavenSelectedDep,
        version
      })
      setMavenVersionVisible(false)
      await loadMavenDependencies()
      addNotification({ type: 'success', message: 'Maven 版本切换成功', description: `${mavenSelectedDep.artifactId}:${version}` })
    } catch (error: any) {
      addNotification({ type: 'error', message: 'Maven 版本切换失败', description: error.message })
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
      width: 240,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="详情">
            <Button size="small" icon={<CodeOutlined />} onClick={() => showPipDetail(record.name)} />
          </Tooltip>
          <Tooltip title="切换版本">
            <Button size="small" icon={<SwapOutlined />} onClick={() => showPipVersions(record)} />
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
      title: '最新',
      key: 'latest',
      width: 150,
      render: (_: any, record: MavenDependencyInfo) => {
        const latest = mavenLatestMap[`${record.groupId}:${record.artifactId}`]
        if (!latest) return '-'
        return (
          <Tag color={latest !== record.version ? 'blue' : 'green'}>
            {latest}
          </Tag>
        )
      }
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
      width: 140,
      render: (_: any, record: MavenDependencyInfo) => (
        <Space>
          <Tooltip title="切换版本">
            <Button size="small" icon={<SwapOutlined />} onClick={() => showMavenVersions(record)} />
          </Tooltip>
          <Popconfirm title={`移除 ${record.artifactId}?`} onConfirm={() => removeMavenDependency(record)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>依赖管理</h2>
            <div className={styles.subtitle}>先选择 npm、pip 或 Maven，再进入项目依赖、全局依赖、发布与配置操作。</div>
          </div>
          <RuntimeManagerSwitch active={activeManager} />
        </div>
        <div className={styles.actions}>
          <ProjectPathBar compact />
          <Button icon={<SettingOutlined />} onClick={() => navigate('/tool-versions')}>
            项目工具版本
          </Button>
        </div>
      </div>

      <Alert
        className={styles.detectBanner}
        type={detectedManagers.length > 0 ? 'success' : 'info'}
        showIcon
        title={detectedManagers.length > 0 ? '已识别当前项目依赖类型' : '请选择项目目录或手动选择管理器'}
        description={
          <Space wrap>
            {detectedManagers.length > 0 ? (
              detectedManagers.map((manager) => (
                <Button
                  key={manager}
                  size="small"
                  type={activeManager === manager ? 'primary' : 'default'}
                  onClick={() => switchManager(manager)}
                >
                  {manager === 'npm' ? `npm${projectInfo?.packageManager ? ` (${projectInfo.packageManager})` : ''}` : manager === 'pip' ? 'pip / requirements.txt' : 'Maven / pom.xml'}
                </Button>
              ))
            ) : (
              <span>未检测到 package.json、requirements.txt 或 pom.xml；仍可通过上方切换器选择要管理的依赖类型。</span>
            )}
          </Space>
        }
      />

      <Tabs className={styles.managerTabs} activeKey={activeManager} onChange={(key: string) => switchManager(key as ManagerType)} items={[
        {
          key: 'npm',
          label: 'npm 管理',
          children: (
            <div className={styles.panel}>
              <Tabs
                items={[
                  {
                    key: 'project',
                    label: '项目依赖',
                    children: <ProjectPage hideToolchainPanel hideProjectSelector />
                  },
                  {
                    key: 'global',
                    label: '全局依赖',
                    children: <GlobalPage />
                  },
                  {
                    key: 'publish',
                    label: '发布管理',
                    children: <PublishPage />
                  }
                ]}
              />
            </div>
          )
        },
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
                <Button icon={<CloudUploadOutlined />} onClick={() => setPipPublishVisible(true)} disabled={!currentPath}>
                  发布到 PyPI
                </Button>
                <Button icon={<CodeOutlined />} onClick={showRequirements} disabled={!currentPath}>
                  查看 requirements
                </Button>
                <Button icon={<CheckCircleOutlined />} onClick={runPipCheck}>
                  依赖检查
                </Button>
                <Button icon={<CheckCircleOutlined />} onClick={repairPipCheck}>
                  自修复依赖
                </Button>
                <Button icon={<SecurityScanOutlined />} onClick={runPipAudit}>
                  安全审计
                </Button>
                <Button icon={<ApartmentOutlined />} onClick={showPipTree}>
                  依赖树
                </Button>
                <Button icon={<WarningOutlined />} onClick={() => setPipHealthVisible(true)} disabled={!currentPath}>
                  依赖诊断
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
                            const next = value as 'official' | 'tsinghua' | 'aliyun' | 'custom'
                            setPipMirror(next)
                            applyPipMirror(next)
                          }}
                          options={[
                            { label: '官方 PyPI', value: 'official' },
                            { label: '清华镜像', value: 'tsinghua' },
                            { label: '阿里云镜像', value: 'aliyun' },
                            { label: '自定义', value: 'custom' }
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
                <Button icon={<WarningOutlined />} onClick={() => setMavenHealthVisible(true)} disabled={!currentPath}>
                  依赖诊断
                </Button>
                <Button icon={<CodeOutlined />} onClick={() => setGoalVisible(true)} disabled={!currentPath}>
                  执行 Maven Goal
                </Button>
                <Button icon={<CloudUploadOutlined />} onClick={() => setMavenPublishVisible(true)} disabled={!currentPath}>
                  发布/Deploy
                </Button>
                <Button icon={<SettingOutlined />} onClick={() => setMavenServerVisible(true)}>
                  远程仓库凭据
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
                            const next = value as 'central' | 'aliyun' | 'tencent' | 'custom'
                            setMavenMirror(next)
                            applyMavenMirror(next)
                          }}
                          options={[
                            { label: '官方 Central', value: 'central' },
                            { label: '阿里云', value: 'aliyun' },
                            { label: '腾讯云', value: 'tencent' },
                            { label: '自定义', value: 'custom' }
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
      ]} />

      <Modal
        title="安装 pip 包"
        open={pipInstallVisible}
        onCancel={() => setPipInstallVisible(false)}
        onOk={() => pipForm.submit()}
        okText="安装"
        cancelText="取消"
      forceRender
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
      forceRender
      >
        <Form form={pipConfigForm} layout="vertical" onFinish={savePipConfig}>
          <Form.Item name="key" label="配置项" rules={[{ required: true, message: '请输入配置项' }]}>
            <AutoComplete options={PIP_CONFIG_KEY_OPTIONS} placeholder="选择常用配置项或输入自定义 key" />
          </Form.Item>
          <Form.Item name="value" label="值" rules={[{ required: true, message: '请输入配置值' }]}>
            <AutoComplete options={PIP_CONFIG_VALUE_OPTIONS} placeholder="选择默认场景值或输入自定义值" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="自定义 pip 镜像源"
        open={pipMirrorVisible}
        onCancel={() => setPipMirrorVisible(false)}
        onOk={() => pipMirrorForm.submit()}
        okText="保存"
        cancelText="取消"
      forceRender
      >
        <Form form={pipMirrorForm} layout="vertical" onFinish={saveCustomPipMirror}>
          <Form.Item name="indexUrl" label="Index URL" rules={[{ required: true, message: '请输入镜像源地址' }]}>
            <AutoComplete options={PIP_CONFIG_VALUE_OPTIONS} placeholder="例如: https://pypi.org/simple" />
          </Form.Item>
          <Form.Item name="trustedHost" label="Trusted Host">
            <AutoComplete options={PIP_CONFIG_VALUE_OPTIONS} placeholder="例如: pypi.org" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发布 Python 包"
        open={pipPublishVisible}
        onCancel={() => setPipPublishVisible(false)}
        onOk={() => pipPublishForm.submit()}
        okText="发布"
        cancelText="取消"
      >
        <Form
          form={pipPublishForm}
          layout="vertical"
          onFinish={publishPipPackage}
          initialValues={{ repositoryUrl: 'https://upload.pypi.org/legacy/', buildBefore: 'true' }}
        >
          <Form.Item name="repositoryUrl" label="远程仓库">
            <AutoComplete options={PIP_REPOSITORY_OPTIONS} placeholder="PyPI/TestPyPI 或自定义 repository-url" />
          </Form.Item>
          <Form.Item name="username" label="用户名">
            <Input placeholder="__token__ 或仓库用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码 / Token">
            <Input.Password placeholder="PyPI token 或仓库密码" />
          </Form.Item>
          <Form.Item name="buildBefore" label="发布前构建">
            <Select
              options={[
                { value: 'true', label: '是，先执行 python -m build' },
                { value: 'false', label: '否，使用现有 dist 产物' }
              ]}
            />
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
        title={`切换 pip 版本 - ${pipSelectedPackage?.name || ''}`}
        open={pipVersionVisible}
        onCancel={() => setPipVersionVisible(false)}
        footer={null}
        width={560}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="blue">{pipSelectedPackage?.version || '-'}</Tag></span>
          <div className={styles.versions}>
            {pipVersionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              pipVersionOptions.slice(0, 50).map((item) => (
                <Tag
                  key={item.value}
                  className={styles.versionTag}
                  color={item.value === pipSelectedPackage?.version ? 'blue' : 'default'}
                  onClick={() => installPipVersion(item.value)}
                >
                  {item.value}
                </Tag>
              ))
            )}
          </div>
        </Space>
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
        title="pip 依赖自修复结果"
        open={pipRepairVisible}
        onCancel={() => setPipRepairVisible(false)}
        footer={null}
        width={800}
      >
        <pre className={styles.output}>{pipRepairOutput}</pre>
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

      <DependencyTreeViewer
        title="pip 依赖树"
        visible={pipTreeVisible}
        data={pipTree}
        onClose={() => setPipTreeVisible(false)}
      />

      <DependencyHealthModal
        visible={pipHealthVisible}
        manager="pip"
        cwd={currentPath}
        onClose={() => setPipHealthVisible(false)}
      />

      <Modal
        title="添加 Maven 依赖"
        open={mavenAddVisible}
        onCancel={() => setMavenAddVisible(false)}
        onOk={() => mavenForm.submit()}
        okText="添加"
        cancelText="取消"
      forceRender
      >
        <Form form={mavenForm} layout="vertical" onFinish={addMavenDependency}>
          <Form.Item name="groupId" label="groupId" rules={[{ required: true, message: '请输入 groupId' }]}>
            <AutoComplete
              options={mavenGroupOptions}
              onSearch={(query) => searchMavenDependencies(query, 'groupId')}
              onSelect={(_, option) => {
                const dep = (option as any).dep as MavenSearchResult
                mavenForm.setFieldsValue({
                  groupId: dep.groupId,
                  artifactId: dep.artifactId,
                  version: dep.latestVersion || dep.version
                })
                setMavenVersionOptions(dep.latestVersion ? [{ value: dep.latestVersion, label: dep.latestVersion }] : [])
              }}
              placeholder="输入 groupId，自动提示本地仓库与 Maven Central"
            />
          </Form.Item>
          <Form.Item name="artifactId" label="artifactId" rules={[{ required: true, message: '请输入 artifactId' }]}>
            <AutoComplete
              options={mavenArtifactOptions}
              onSearch={(query) => searchMavenDependencies(query, 'artifactId')}
              onSelect={(_, option) => {
                const dep = (option as any).dep as MavenSearchResult
                mavenForm.setFieldsValue({
                  groupId: dep.groupId,
                  artifactId: dep.artifactId,
                  version: dep.latestVersion || dep.version
                })
                setMavenVersionOptions(dep.latestVersion ? [{ value: dep.latestVersion, label: dep.latestVersion }] : [])
              }}
              placeholder="输入 artifactId 或关键字搜索"
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
      forceRender
      >
        <Form form={goalForm} layout="vertical" onFinish={runMavenGoal} initialValues={{ goal: 'test' }}>
          <Form.Item name="goal" label="Goal" rules={[{ required: true, message: '请输入 Maven goal' }]}>
            <Select showSearch options={COMMON_MAVEN_GOALS.map((goal) => ({ label: goal, value: goal }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`切换 Maven 版本 - ${mavenSelectedDep?.artifactId || ''}`}
        open={mavenVersionVisible}
        onCancel={() => setMavenVersionVisible(false)}
        footer={null}
        width={560}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>当前版本: <Tag color="blue">{mavenSelectedDep?.version || '继承/变量'}</Tag></span>
          <div className={styles.versions}>
            {mavenVersionOptions.length === 0 ? (
              <Empty description="未找到版本信息" />
            ) : (
              mavenVersionOptions.slice(0, 50).map((item) => (
                <Tag
                  key={item.value}
                  className={styles.versionTag}
                  color={item.value === mavenSelectedDep?.version ? 'blue' : 'default'}
                  onClick={() => installMavenVersion(item.value)}
                >
                  {item.value}
                </Tag>
              ))
            )}
          </div>
        </Space>
      </Modal>

      <Modal
        title="自定义 Maven 镜像"
        open={mavenMirrorVisible}
        onCancel={() => setMavenMirrorVisible(false)}
        onOk={() => mavenMirrorForm.submit()}
        okText="保存"
        cancelText="取消"
      forceRender
      >
        <Form form={mavenMirrorForm} layout="vertical" onFinish={saveCustomMavenMirror}>
          <Form.Item name="id" label="Mirror ID" rules={[{ required: true, message: '请输入 mirror id' }]}>
            <Input placeholder="例如: company-central" />
          </Form.Item>
          <Form.Item name="url" label="镜像 URL" rules={[{ required: true, message: '请输入镜像 URL' }]}>
            <AutoComplete options={MAVEN_REPOSITORY_OPTIONS} placeholder="例如: https://repo.maven.apache.org/maven2" />
          </Form.Item>
          <Form.Item name="mirrorOf" label="Mirror Of">
            <AutoComplete
              options={[
                { value: 'central', label: 'central' },
                { value: '*', label: '*' },
                { value: 'external:*', label: 'external:*' }
              ]}
              placeholder="默认 central"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Maven 远程仓库凭据"
        open={mavenServerVisible}
        onCancel={() => setMavenServerVisible(false)}
        onOk={() => mavenServerForm.submit()}
        okText="保存"
        cancelText="取消"
      forceRender
      >
        <Form form={mavenServerForm} layout="vertical" onFinish={saveMavenServer}>
          <Form.Item name="id" label="Server ID" rules={[{ required: true, message: '请输入 server id' }]}>
            <AutoComplete
              options={[
                { value: 'releases', label: 'releases' },
                { value: 'snapshots', label: 'snapshots' },
                { value: 'github', label: 'github' },
                { value: 'ossrh', label: 'ossrh' }
              ]}
              placeholder="需与 pom.xml distributionManagement 或 deploy 配置一致"
            />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="仓库用户名或 token 用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码 / Token" rules={[{ required: true, message: '请输入密码或 token' }]}>
            <Input.Password placeholder="远程仓库密码或 token" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发布 Maven 包"
        open={mavenPublishVisible}
        onCancel={() => setMavenPublishVisible(false)}
        onOk={() => mavenPublishForm.submit()}
        okText="发布"
        cancelText="取消"
      >
        <Form
          form={mavenPublishForm}
          layout="vertical"
          onFinish={publishMavenPackage}
          initialValues={{ goals: 'deploy', skipTests: 'true', repositoryId: 'releases' }}
        >
          <Form.Item name="goals" label="发布 Goal">
            <AutoComplete
              options={[
                { value: 'deploy', label: 'deploy' },
                { value: 'clean deploy', label: 'clean deploy' },
                { value: 'deploy -Prelease', label: 'deploy -Prelease' }
              ]}
              placeholder="默认 deploy"
            />
          </Form.Item>
          <Form.Item name="repositoryId" label="远程仓库 ID">
            <AutoComplete
              options={[
                { value: 'releases', label: 'releases' },
                { value: 'snapshots', label: 'snapshots' },
                { value: 'github', label: 'github' },
                { value: 'ossrh', label: 'ossrh' }
              ]}
              placeholder="与 settings.xml server id 一致"
            />
          </Form.Item>
          <Form.Item name="repositoryUrl" label="远程仓库 URL">
            <AutoComplete options={MAVEN_REPOSITORY_OPTIONS} placeholder="留空则使用 pom.xml distributionManagement" />
          </Form.Item>
          <Form.Item name="skipTests" label="跳过测试">
            <Select
              options={[
                { value: 'true', label: '是，追加 -DskipTests' },
                { value: 'false', label: '否' }
              ]}
            />
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

      <DependencyTreeViewer
        title="Maven 依赖树"
        visible={mavenTreeVisible}
        data={mavenTree}
        onClose={() => setMavenTreeVisible(false)}
      />

      <DependencyHealthModal
        visible={mavenHealthVisible}
        manager="maven"
        cwd={currentPath}
        onClose={() => setMavenHealthVisible(false)}
      />

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
