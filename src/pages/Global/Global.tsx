import React, { useEffect, useState } from 'react'
import { Button, Empty, Spin, Modal, Form, Input, Tag, Dropdown, Space, Tooltip, Table } from 'antd'
import { ReloadOutlined, PlusOutlined, SwapOutlined, FolderFilled, SyncOutlined, CheckCircleOutlined, WarningOutlined, HistoryOutlined, ApartmentOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { usePackageStore, PackageInfo } from '../../stores/packageStore'
import { DependencyTreeModal } from '../../components/Package/DependencyTreeModal'
import { PackageDetailModal } from '../../components/Package/PackageDetailModal'
import styles from './Global.module.css'

const GlobalPage: React.FC = () => {
  const [installVisible, setInstallVisible] = useState(false)
  const [versionVisible, setVersionVisible] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null)
  const [versions, setVersions] = useState<string[]>([])
  const [installForm] = Form.useForm()
  const [checkingAll, setCheckingAll] = useState(false)
  const [depTreeVisible, setDepTreeVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailPackage, setDetailPackage] = useState<string>('')
  
  const addNotification = useAppStore((state) => state.addNotification)
  const { globalPackages, loading, fetchGlobalPackages, installPackage, uninstallPackage, updatePackage, installSpecificVersion } = usePackageStore()
  
  useEffect(() => {
    fetchGlobalPackages()
  }, [])
  
  const handleRefresh = async () => {
    await fetchGlobalPackages()
    addNotification({
      type: 'success',
      message: '刷新成功'
    })
  }
  
  const handleCheckAllOutdated = async () => {
    setCheckingAll(true)
    try {
      await fetchGlobalPackages()
      addNotification({
        type: 'success',
        message: '检查完成'
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '检查失败',
        description: error.message
      })
    } finally {
      setCheckingAll(false)
    }
  }
  
  const handleUpdate = async (packageName: string) => {
    try {
      await updatePackage({
        packageName,
        global: true
      })
      addNotification({
        type: 'success',
        message: '更新成功',
        description: `${packageName} 已更新到最新版本`
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '更新失败',
        description: error.message
      })
    }
  }
  
  const handleUninstall = async (packageName: string) => {
    try {
      await uninstallPackage({
        packageName,
        global: true
      })
      addNotification({
        type: 'success',
        message: '卸载成功',
        description: `${packageName} 已卸载`
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '卸载失败',
        description: error.message
      })
    }
  }
  
  const handleInstall = async (values: any) => {
    try {
      await installPackage({
        packageName: values.package,
        global: true,
        version: values.version
      })
      addNotification({
        type: 'success',
        message: '安装成功',
        description: `${values.package} 已成功安装到全局`
      })
      setInstallVisible(false)
      installForm.resetFields()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '安装失败',
        description: error.message
      })
    }
  }
  
  const handleShowVersions = async (pkg: PackageInfo) => {
    setSelectedPackage(pkg)
    try {
      const versionList = await window.electronAPI.npm.getVersions(pkg.name)
      setVersions(versionList)
      setVersionVisible(true)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '获取版本列表失败',
        description: error.message
      })
    }
  }
  
  const handleInstallVersion = async (version: string) => {
    if (!selectedPackage) return
    
    try {
      await installSpecificVersion({
        packageName: selectedPackage.name,
        version,
        global: true
      })
      addNotification({
        type: 'success',
        message: '版本切换成功',
        description: `${selectedPackage.name}@${version} 已安装`
      })
      setVersionVisible(false)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '版本切换失败',
        description: error.message
      })
    }
  }
  
  const handleOpenPackagePath = async (packageName: string) => {
    try {
      const globalPath = await window.electronAPI.npm.configGet('prefix')
      const path = `${globalPath}/node_modules/${packageName}`
      await window.electronAPI.system.openPath(path)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '打开路径失败',
        description: error.message
      })
    }
  }
  
  const handleUpdateAll = async () => {
    try {
      await updatePackage({ global: true })
      addNotification({
        type: 'success',
        message: '全部更新完成'
      })
      await fetchGlobalPackages()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '更新失败',
        description: error.message
      })
    }
  }
  
  const handleViewChangelog = async (packageName: string) => {
    try {
      const info = await window.electronAPI.npm.getPackageInfo(packageName)
      if (info?.homepage) {
        await window.electronAPI.openExternal(info.homepage)
      } else if (info?.repository?.url) {
        let url = info.repository.url
        if (url.startsWith('git+')) {
          url = url.replace('git+', '').replace('.git', '')
        }
        if (url.includes('github.com')) {
          await window.electronAPI.openExternal(`${url}/releases`)
        } else {
          await window.electronAPI.openExternal(url)
        }
      } else {
        await window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
      }
    } catch (error: any) {
      await window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
    }
  }
  
  const columns = [
    {
      title: '包名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string, record: PackageInfo) => (
        <Space>
          <span className={styles.pkgName}>{text}</span>
          {record.outdated && (
            <Tooltip title="有新版本可用">
              <WarningOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '当前版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (text: string) => <Tag>v{text}</Tag>
    },
    {
      title: '最新版本',
      dataIndex: 'latest',
      key: 'latest',
      width: 120,
      render: (text: string, record: PackageInfo) => 
        text ? (
          <Space>
            <Tag color={text !== record.version ? 'blue' : 'green'}>
              v{text}
            </Tag>
            {text !== record.version && (
              <Tooltip title="查看更新日志">
                <Button 
                  size="small" 
                  type="link" 
                  icon={<HistoryOutlined />}
                  onClick={() => handleViewChangelog(record.name)}
                />
              </Tooltip>
            )}
          </Space>
        ) : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: PackageInfo) => (
        <Space>
          {record.outdated && (
            <Tooltip title="更新">
              <Button size="small" icon={<SyncOutlined />} onClick={() => handleUpdate(record.name)} />
            </Tooltip>
          )}
          <Dropdown menu={{
            items: [
              { key: 'detail', label: '查看详情', icon: <InfoCircleOutlined /> },
              { key: 'version', label: '切换版本', icon: <SwapOutlined /> },
              { key: 'open', label: '打开文件路径', icon: <FolderFilled /> },
              { key: 'changelog', label: '查看更新日志', icon: <HistoryOutlined /> },
              { key: 'uninstall', label: '卸载', icon: <ReloadOutlined />, danger: true }
            ],
            onClick: ({ key }) => {
              if (key === 'detail') {
                setDetailPackage(record.name)
                setDetailVisible(true)
              } else if (key === 'version') {
                handleShowVersions(record)
              } else if (key === 'open') {
                handleOpenPackagePath(record.name)
              } else if (key === 'changelog') {
                handleViewChangelog(record.name)
              } else if (key === 'uninstall') {
                Modal.confirm({
                  title: '确认卸载',
                  content: `确定要卸载 ${record.name} 吗？`,
                  onOk: () => handleUninstall(record.name)
                })
              }
            }
          }}>
            <Button size="small">更多</Button>
          </Dropdown>
        </Space>
      )
    }
  ]
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>全局依赖</h2>
        <div className={styles.actions}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setInstallVisible(true)}>
            全局安装包
          </Button>
          <Button icon={<CheckCircleOutlined />} onClick={handleCheckAllOutdated} loading={checkingAll}>
            检查更新
          </Button>
          <Button icon={<SyncOutlined />} onClick={handleUpdateAll}>
            更新全部
          </Button>
          <Button 
            icon={<ApartmentOutlined />} 
            onClick={() => setDepTreeVisible(true)}
          >
            依赖树
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            刷新
          </Button>
        </div>
      </div>
      
      <div className={styles.content}>
        <Spin spinning={loading}>
          {globalPackages.length === 0 ? (
            <Empty description="暂无全局依赖" />
          ) : (
            <Table 
              dataSource={globalPackages}
              columns={columns}
              rowKey="name"
              size="small"
              pagination={false}
            />
          )}
        </Spin>
      </div>
      
      <Modal
        title="全局安装包"
        open={installVisible}
        onCancel={() => setInstallVisible(false)}
        onOk={() => installForm.submit()}
        okText="安装"
        cancelText="取消"
      >
        <Form form={installForm} onFinish={handleInstall} layout="vertical">
          <Form.Item name="package" label="包名" rules={[{ required: true, message: '请输入包名' }]}>
            <Input placeholder="例如: typescript 或 typescript@5.0.0" />
          </Form.Item>
          <Form.Item name="version" label="版本（可选）">
            <Input placeholder="例如: ^5.0.0 或 latest" />
          </Form.Item>
        </Form>
      </Modal>
      
      <Modal
        title={`切换版本 - ${selectedPackage?.name}`}
        open={versionVisible}
        onCancel={() => setVersionVisible(false)}
        footer={null}
        width={500}
      >
        <div className={styles.versionList}>
          <p style={{ marginBottom: 12, color: '#999' }}>
            当前版本: <Tag color="blue">{selectedPackage?.version}</Tag>
          </p>
          <Spin spinning={versions.length === 0}>
            <div className={styles.versions}>
              {versions.slice(0, 50).map(version => (
                <Tag 
                  key={version}
                  className={styles.versionTag}
                  color={version === selectedPackage?.version ? 'blue' : 'default'}
                  onClick={() => handleInstallVersion(version)}
                >
                  {version}
                </Tag>
              ))}
            </div>
          </Spin>
        </div>
      </Modal>
      
      <DependencyTreeModal
        visible={depTreeVisible}
        type="global"
        onClose={() => setDepTreeVisible(false)}
      />
      
      <PackageDetailModal
        visible={detailVisible}
        packageName={detailPackage}
        onClose={() => setDetailVisible(false)}
      />
    </div>
  )
}

export default GlobalPage