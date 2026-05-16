import React, { useEffect, useState } from 'react'
import { Descriptions, Button, Input, Divider, Alert, Tabs, Modal, Form, Tag, Spin, Table, Space, Tooltip, Select, Radio, AutoComplete } from 'antd'
import {
  UserOutlined, SettingOutlined, 
  DeleteOutlined, SyncOutlined, FolderOpenOutlined,
  EditOutlined, QuestionCircleOutlined,
  CloudServerOutlined, InfoCircleOutlined,
  LoginOutlined, SafetyCertificateOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { AppLanguage, useSettingsStore } from '../../stores/settingsStore'
import GlobalToolchainPanel from '../../components/Toolchain/GlobalToolchainPanel'
import { useT } from '../../i18n'
import { localizedMessage as message } from '../../utils/localizedFeedback'
import styles from './Settings.module.css'

const SettingsPage: React.FC = () => {
  const [npmConfig, setNpmConfig] = useState<any>({})
  const [currentUser, setCurrentUser] = useState<string>('')
  const [registry, setRegistry] = useState<string>('')
  const [npmInfo, setNpmInfo] = useState<any>({})
  const [cachePath, setCachePath] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [configEditVisible, setConfigEditVisible] = useState(false)
  const [configForm] = Form.useForm()
  const [publishedPackages, setPublishedPackages] = useState<any[]>([])
  const [helpContent, setHelpContent] = useState<string>('')
  const [helpVisible, setHelpVisible] = useState(false)
  const [loginVisible, setLoginVisible] = useState(false)
  const [loginForm] = Form.useForm()
  const t = useT()
  const language = useSettingsStore((state) => state.language)
  const updateStrategy = useSettingsStore((state) => state.updateStrategy)
  const conflictStrategy = useSettingsStore((state) => state.conflictStrategy)
  const securitySensitivity = useSettingsStore((state) => state.securitySensitivity)
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const setUpdateStrategy = useSettingsStore((state) => state.setUpdateStrategy)
  const setConflictStrategy = useSettingsStore((state) => state.setConflictStrategy)
  const setSecuritySensitivity = useSettingsStore((state) => state.setSecuritySensitivity)
  
  const addNotification = useAppStore((state) => state.addNotification)
  const configKeyOptions = [
    { value: 'registry', label: 'registry（npm 镜像源）' },
    { value: 'cache', label: 'cache（缓存目录）' },
    { value: 'prefix', label: 'prefix（全局前缀）' },
    { value: 'userconfig', label: 'userconfig（用户配置文件）' },
    { value: 'init-version', label: 'init-version（初始化版本）' },
    { value: 'init-license', label: 'init-license（初始化许可证）' },
    { value: 'audit-level', label: 'audit-level（审计级别）' }
  ]
  const configValueOptions = [
    { value: 'https://registry.npmjs.org/', label: 'npm 官方' },
    { value: 'https://registry.npmmirror.com', label: 'npmmirror' },
    { value: 'https://registry.yarnpkg.com', label: 'Yarn' },
    { value: 'public', label: 'public' },
    { value: 'restricted', label: 'restricted' }
  ]
  
  useEffect(() => {
    loadConfig()
    loadNpmInfo()
    loadCachePath()
  }, [])
  
  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.npm.configList()
      setNpmConfig(config)
      setRegistry(config.registry || 'https://registry.npmjs.org/')
      
      const user = await window.electronAPI.npm.whoami()
      setCurrentUser(user)
      
      if (user) {
        const packages = await window.electronAPI.npm.getPublished(user)
        setPublishedPackages(packages)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }
  
  const loadNpmInfo = async () => {
    try {
      const info = await window.electronAPI.system.getNpmInfo()
      setNpmInfo(info)
    } catch (error) {
      console.error('Failed to load npm info:', error)
    }
  }
  
  const loadCachePath = async () => {
    try {
      const path = await window.electronAPI.system.getCachePath()
      setCachePath(path)
    } catch (error) {
      console.error('Failed to load cache path:', error)
    }
  }
  
  const handleSetRegistry = async () => {
    if (!registry.trim()) {
      message.warning('请输入 registry 地址')
      return
    }
    
    setLoading(true)
    try {
      await window.electronAPI.npm.configSet('registry', registry)
      addNotification({
        type: 'success',
        message: '设置成功',
        description: `Registry 已设置为 ${registry}`
      })
      await loadConfig()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '设置失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleLogin = async () => {
    setLoginVisible(true)
    loginForm.resetFields()
  }
  
  const handleLoginSubmit = async (values: any) => {
    setLoading(true)
    try {
      const registryKey = getRegistryAuthTokenKey(values.registry || registry)
      if (values.authType === 'token') {
        await window.electronAPI.npm.configSet(registryKey, values.token)
      } else if (values.authType === 'legacy') {
        await window.electronAPI.npm.adduser(values.registry || undefined)
      } else {
        await window.electronAPI.npm.login(values.registry || undefined)
      }
      addNotification({
        type: 'success',
        message: '登录成功'
      })
      setLoginVisible(false)
      await loadConfig()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '登录失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const getRegistryAuthTokenKey = (registryUrl: string) => {
    try {
      const url = new URL(registryUrl)
      const path = url.pathname.replace(/\/$/, '')
      return `//${url.host}${path ? `${path}` : ''}/:_authToken`
    } catch {
      return '//registry.npmjs.org/:_authToken'
    }
  }
  
  const handleLogout = async () => {
    setLoading(true)
    try {
      await window.electronAPI.npm.logout(registry !== 'https://registry.npmjs.org/' ? registry : undefined)
      setCurrentUser('')
      setPublishedPackages([])
      addNotification({
        type: 'success',
        message: '登出成功'
      })
      await loadConfig()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '登出失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleClearCache = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.system.clearCache()
      addNotification({
        type: 'success',
        message: '缓存清理成功',
        description: result
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '缓存清理失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleUpdateNpm = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.system.updateNpm()
      addNotification({
        type: 'success',
        message: 'npm 更新成功',
        description: result
      })
      await loadNpmInfo()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: 'npm 更新失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleShowHelp = async (command?: string) => {
    setLoading(true)
    try {
      const content = await window.electronAPI.system.npmHelp(command)
      setHelpContent(content)
      setHelpVisible(true)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '获取帮助失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleSetCachePath = async () => {
    const newPath = await window.electronAPI.selectDirectory()
    if (newPath) {
      setLoading(true)
      try {
        await window.electronAPI.system.setCachePath(newPath)
        addNotification({
          type: 'success',
          message: '缓存目录已更改',
          description: newPath
        })
        await loadCachePath()
      } catch (error: any) {
        addNotification({
          type: 'error',
          message: '更改缓存目录失败',
          description: error.message
        })
      } finally {
        setLoading(false)
      }
    }
  }
  
  const handleConfigEdit = () => {
    setConfigEditVisible(true)
    configForm.resetFields()
  }
  
  const handleSaveConfig = async (values: any) => {
    setLoading(true)
    try {
      if (values.key && values.value) {
        await window.electronAPI.npm.configSet(values.key, values.value)
        addNotification({
          type: 'success',
          message: '配置已保存'
        })
        await loadConfig()
      }
      setConfigEditVisible(false)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '保存配置失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleDeleteConfig = async (key: string) => {
    setLoading(true)
    try {
      await window.electronAPI.npm.configDelete(key)
      addNotification({
        type: 'success',
        message: '配置已删除'
      })
      await loadConfig()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '删除配置失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleOpenNpmrc = async () => {
    try {
      await window.electronAPI.npm.configEdit()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '打开配置文件失败',
        description: error.message
      })
    }
  }
  
  const publishedColumns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version'
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: '更新时间',
      dataIndex: 'date',
      key: 'date',
      render: (text: string) => text ? new Date(text).toLocaleDateString() : '-'
    }
  ]
  
  const configItems = [
    { key: 'registry', label: 'Registry' },
    { key: 'cache', label: '缓存目录' },
    { key: 'prefix', label: '全局前缀' },
    { key: 'userconfig', label: '用户配置文件' },
    { key: 'init-version', label: 'init版本' },
    { key: 'author', label: '作者' },
    { key: 'email', label: '邮箱' }
  ]
  
  const TabItems = [
    {
      key: 'preferences',
      label: t('settings.preferences'),
      icon: <SettingOutlined />,
      children: (
        <div className={styles.tabContent}>
          <Descriptions bordered column={1}>
            <Descriptions.Item label={t('settings.language')}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Select<AppLanguage>
                  value={language}
                  onChange={(value) => setLanguage(value)}
                  style={{ width: 220 }}
                  options={[
                    { value: 'en-US', label: t('settings.languageEnglish') },
                    { value: 'zh-CN', label: t('settings.languageChinese') }
                  ]}
                />
                <span style={{ color: '#888', fontSize: 12 }}>{t('settings.languageDescription')}</span>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <Alert
            style={{ marginTop: 16 }}
            title={t('settings.savedHint')}
            type="info"
            showIcon
          />
        </div>
      )
    },
    {
      key: 'update',
      label: '更新策略',
      icon: <ThunderboltOutlined />,
      children: (
        <div className={styles.tabContent}>
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 16 }}>更新策略</h4>
            <Radio.Group value={updateStrategy} onChange={(e) => setUpdateStrategy(e.target.value)}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Radio value="recommended">
                  <div>
                    <strong>推荐更新</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>使用 wanted 版本（符合 package.json 范围，兼容性优先）</div>
                  </div>
                </Radio>
                <Radio value="smart">
                  <div>
                    <strong>智能更新</strong>
                    <Space>
                      <Tag color="green">兼容性优先</Tag>
                      <Tag color="orange">其次安全</Tag>
                    </Space>
                    <div style={{ color: '#888', fontSize: 12 }}>自动分析选择最佳版本，冲突时提示</div>
                  </div>
                </Radio>
                <Radio value="security">
                  <div>
                    <strong>安全优先更新</strong>
                    <Space>
                      <Tag color="red">安全优先</Tag>
                      <Tag color="orange">可能存在兼容问题</Tag>
                    </Space>
                    <div style={{ color: '#888', fontSize: 12 }}>优先升级到可用的安全/最新版本，适合处理漏洞修复</div>
                  </div>
                </Radio>
                <Radio value="latest">
                  <div>
                    <strong>最新更新</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>使用 latest 版本（可能包含预发布版）</div>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <Divider />

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 16 }}>冲突处理策略</h4>
            <Radio.Group value={conflictStrategy} onChange={(e) => setConflictStrategy(e.target.value)}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Radio value="prompt">
                  <div>
                    <strong>总是提示</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>发现冲突时逐个提示用户选择</div>
                  </div>
                </Radio>
                <Radio value="auto-recommended">
                  <div>
                    <strong>自动选择推荐版本</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>发现冲突时自动选择推荐版本（兼容性优先）</div>
                  </div>
                </Radio>
                <Radio value="auto-security">
                  <div>
                    <strong>自动选择安全版本</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>发现安全更新冲突时优先选择安全版本</div>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <Divider />

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 16 }}>安全更新敏感度</h4>
            <Radio.Group value={securitySensitivity} onChange={(e) => setSecuritySensitivity(e.target.value)}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Radio value="high">
                  <div>
                    <strong>高</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>只要有安全更新就提示</div>
                  </div>
                </Radio>
                <Radio value="medium">
                  <div>
                    <strong>中</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>中等及以上风险提示</div>
                  </div>
                </Radio>
                <Radio value="low">
                  <div>
                    <strong>低</strong>
                    <div style={{ color: '#888', fontSize: 12 }}>仅严重风险提示</div>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <Alert
            title="提示"
            description="设置已自动保存，并将在下次更新预览与执行时生效"
            type="info"
            showIcon
          />
        </div>
      )
    },
    {
      key: 'toolchain',
      label: '全局工具版本',
      icon: <SettingOutlined />,
      children: (
        <div className={styles.tabContent}>
          <GlobalToolchainPanel />
        </div>
      )
    },
    {
      key: 'user',
      label: '用户信息',
      icon: <UserOutlined />,
      children: (
        <div className={styles.tabContent}>
          {currentUser ? (
            <div className={styles.userInfo}>
              <Alert
                title={`已登录: ${currentUser}`}
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Button danger onClick={handleLogout} loading={loading}>
                登出
              </Button>
              
              <Divider />
              
              <h4 style={{ marginBottom: 12 }}>已发布的包</h4>
              <Table 
                dataSource={publishedPackages} 
                columns={publishedColumns}
                rowKey="name"
                size="small"
                pagination={false}
              />
            </div>
          ) : (
            <div className={styles.loginPrompt}>
              <Alert
                title="未登录"
                description="登录以发布包到 npm registry"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Button type="primary" icon={<LoginOutlined />} onClick={handleLogin}>
                登录 npm
              </Button>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'registry',
      label: 'Registry设置',
      icon: <CloudServerOutlined />,
      children: (
        <div className={styles.tabContent}>
          <div className={styles.registrySection}>
            <label className={styles.label}>当前 Registry:</label>
            <Input
              value={registry}
              onChange={(e) => setRegistry(e.target.value)}
              placeholder="https://registry.npmjs.org/"
              className={styles.registryInput}
            />
            <Button type="primary" onClick={handleSetRegistry} loading={loading}>
              设置
            </Button>
          </div>
          
          <Divider />
          
          <div className={styles.presets}>
            <h4>常用 Registry:</h4>
            <div className={styles.presetButtons}>
              <Button size="small" onClick={() => setRegistry('https://registry.npmjs.org/')}>
                npm 官方
              </Button>
              <Button size="small" onClick={() => setRegistry('https://registry.npmmirror.com')}>
                淘宝镜像
              </Button>
              <Button size="small" onClick={() => setRegistry('https://registry.yarnpkg.com')}>
                Yarn
              </Button>
              <Button size="small" onClick={() => setRegistry('https://mirror.cloudsmith.io')}>
                Cloudsmith
              </Button>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'config',
      label: '配置管理',
      icon: <SettingOutlined />,
      children: (
        <div className={styles.tabContent}>
          <Space style={{ marginBottom: 16 }}>
            <Button icon={<EditOutlined />} onClick={handleConfigEdit}>
              添加配置
            </Button>
            <Button icon={<FolderOpenOutlined />} onClick={handleOpenNpmrc}>
              打开配置文件
            </Button>
          </Space>
          
          <Table 
            dataSource={configItems.filter(item => npmConfig[item.key])}
            columns={[
              {
                title: '配置项',
                dataIndex: 'label',
                key: 'label'
              },
              {
                title: '值',
                dataIndex: 'key',
                key: 'value',
                render: (key: string) => npmConfig[key] || '-'
              },
              {
                title: '操作',
                key: 'action',
                render: (_, record: any) => (
                  <Space>
                    <Tooltip title="编辑">
                      <Button 
                        size="small" 
                        icon={<EditOutlined />}
                        onClick={() => {
                          configForm.setFieldsValue({ key: record.key, value: npmConfig[record.key] })
                          setConfigEditVisible(true)
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button 
                        size="small" 
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteConfig(record.key)}
                      />
                    </Tooltip>
                  </Space>
                )
              }
            ]}
            rowKey="key"
            size="small"
            pagination={false}
          />
        </div>
      )
    },
    {
      key: 'system',
      label: '系统信息',
      icon: <InfoCircleOutlined />,
      children: (
        <div className={styles.tabContent}>
          {npmInfo.npmError && (
            <Alert
              title="npm 信息读取失败"
              description={npmInfo.npmError}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Descriptions bordered column={1}>
            <Descriptions.Item label="npm 版本">{npmInfo.npmVersion || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Node 版本">{npmInfo.nodeVersion || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Electron 版本">{npmInfo.electronVersion || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="平台">{npmInfo.platform || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="架构">{npmInfo.arch || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="缓存目录">
              <Space>
                {cachePath}
                <Button size="small" icon={<FolderOpenOutlined />} onClick={handleSetCachePath}>
                  更改
                </Button>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          
          <Divider />
          
          <Space>
            <Button icon={<DeleteOutlined />} onClick={handleClearCache} loading={loading}>
              清理缓存
            </Button>
            <Button icon={<SyncOutlined />} onClick={handleUpdateNpm} loading={loading}>
              更新 npm
            </Button>
          </Space>
        </div>
      )
    },
    {
      key: 'help',
      label: '帮助',
      icon: <QuestionCircleOutlined />,
      children: (
        <div className={styles.tabContent}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Button onClick={() => handleShowHelp()}>查看 npm 帮助</Button>
            <Button onClick={() => handleShowHelp('install')}>npm install 帮助</Button>
            <Button onClick={() => handleShowHelp('publish')}>npm publish 帮助</Button>
            <Button onClick={() => handleShowHelp('config')}>npm config 帮助</Button>
            <Button onClick={() => handleShowHelp('run-script')}>npm run-script 帮助</Button>
            <Button onClick={() => handleShowHelp('update')}>npm update 帮助</Button>
          </Space>
        </div>
      )
    }
  ]
  
  return (
    <Spin spinning={loading}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('app.settings')}</h2>
        </div>
        
        <div className={styles.content}>
          <Tabs items={TabItems} />
        </div>
        
        <Modal
          title="添加/编辑配置"
          open={configEditVisible}
          onCancel={() => setConfigEditVisible(false)}
          onOk={() => configForm.submit()}
        forceRender
        >
          <Form form={configForm} onFinish={handleSaveConfig} layout="vertical">
            <Form.Item name="key" label="配置项" rules={[{ required: true }]}>
              <AutoComplete options={configKeyOptions} placeholder="选择常用配置项或输入自定义 key" />
            </Form.Item>
            <Form.Item name="value" label="值" rules={[{ required: true }]}>
              <AutoComplete options={configValueOptions} placeholder="选择默认值或输入自定义值" />
            </Form.Item>
          </Form>
        </Modal>
        
        <Modal
          title="npm 登录"
          open={loginVisible}
          onCancel={() => setLoginVisible(false)}
          onOk={() => loginForm.submit()}
        forceRender
        >
          <Form form={loginForm} onFinish={handleLoginSubmit} layout="vertical" initialValues={{ authType: 'interactive' }}>
            <Form.Item name="authType" label="认证方式" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="interactive">
                  <Space><SafetyCertificateOutlined /> 交互式登录（推荐）</Space>
                </Select.Option>
                <Select.Option value="token">
                  <Space><LoginOutlined /> Token 认证</Space>
                </Select.Option>
                <Select.Option value="legacy">
                  <Space><UserOutlined /> 传统用户名密码</Space>
                </Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="registry" label="Registry（可选）">
              <Input placeholder="自定义 registry 地址" />
            </Form.Item>
            <Form.Item 
              noStyle 
              shouldUpdate={(prev, cur) => prev.authType !== cur.authType}
            >
              {({ getFieldValue }) => {
                const authType = getFieldValue('authType')
                if (authType === 'token') {
                  return (
                    <Form.Item name="token" label="Access Token" rules={[{ required: true }]}>
                      <Input.Password placeholder="输入 npm access token" />
                    </Form.Item>
                  )
                }
                return null
              }}
            </Form.Item>
          </Form>
        </Modal>
        
        <Modal
          title="npm 帮助"
          open={helpVisible}
          onCancel={() => setHelpVisible(false)}
          footer={null}
          width={700}
        >
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{helpContent}</pre>
        </Modal>
      </div>
    </Spin>
  )
}

export default SettingsPage
