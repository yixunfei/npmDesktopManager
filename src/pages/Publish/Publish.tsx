import React, { useState, useEffect } from 'react'
import { Button, Card, Form, Input, Select, Alert, Descriptions, Tag, message, Space, Switch } from 'antd'
import { FolderOpenOutlined, CloudUploadOutlined, CheckCircleOutlined, WarningOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import styles from './Publish.module.css'

const PublishPage: React.FC = () => {
  const [projectPath, setProjectPath] = useState('')
  const [checkResult, setCheckResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [form] = Form.useForm()
  const [editMode, setEditMode] = useState(false)
  const [packageJson, setPackageJson] = useState<any>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  
  const addNotification = useAppStore((state) => state.addNotification)
  
  useEffect(() => {
    if (projectPath && checkResult?.packageInfo) {
      form.setFieldsValue({
        name: checkResult.packageInfo.name,
        version: checkResult.packageInfo.version,
        description: checkResult.packageInfo.description || '',
        license: checkResult.packageInfo.license || '',
        author: typeof checkResult.packageInfo.author === 'string' 
          ? checkResult.packageInfo.author 
          : checkResult.packageInfo.author?.name || '',
        homepage: checkResult.packageInfo.homepage || '',
        repository: typeof checkResult.packageInfo.repository === 'string'
          ? checkResult.packageInfo.repository
          : checkResult.packageInfo.repository?.url || ''
      })
    }
  }, [projectPath, checkResult])
  
  const handleSelectDirectory = async () => {
    const path = await window.electronAPI.selectDirectory()
    if (path) {
      setProjectPath(path)
      setCheckResult(null)
      setEditMode(false)
    }
  }
  
  const handleCheck = async () => {
    if (!projectPath) {
      message.warning('请先选择项目目录')
      return
    }
    
    setChecking(true)
    try {
      const result = await window.electronAPI.publish.check(projectPath)
      setCheckResult(result)
      
      const pkg = await window.electronAPI.project.readPackage(projectPath)
      setPackageJson(pkg)
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '检查失败',
        description: error.message
      })
    } finally {
      setChecking(false)
    }
  }
  
  const handlePublish = async (values: any) => {
    if (!checkResult?.canPublish) {
      message.error('请先检查项目并解决所有错误')
      return
    }

    if (!values.version?.trim()) {
      message.warning('请填写发布版本号')
      return
    }
    
    setLoading(true)
    try {
      const publishVersion = values.version.trim()
      if (packageJson && publishVersion !== checkResult.packageInfo.version) {
        const updatedPackage = {
          ...packageJson,
          version: publishVersion
        }
        await window.electronAPI.project.writePackage(projectPath, updatedPackage)
        setPackageJson(updatedPackage)
        setCheckResult((prev: any) => prev ? {
          ...prev,
          packageInfo: {
            ...prev.packageInfo,
            version: publishVersion
          }
        } : prev)
      }

      await window.electronAPI.publish.publish({
        cwd: projectPath,
        tag: values.tag,
        access: values.access,
        registry: values.registry
      })
      addNotification({
        type: 'success',
        message: '发布成功',
        description: `${checkResult.packageInfo.name}@${publishVersion} 已成功发布`
      })
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '发布失败',
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleSavePackageJson = async () => {
    setSaveLoading(true)
    try {
      const values = await form.validateFields()
      
      const updatedPackage = {
        ...packageJson,
        name: values.name,
        version: values.version,
        description: values.description,
        license: values.license,
        author: values.author,
        homepage: values.homepage,
        repository: values.repository
      }
      
      await window.electronAPI.project.writePackage(projectPath, updatedPackage)
      
      addNotification({
        type: 'success',
        message: 'package.json 已更新'
      })
      
      setEditMode(false)
      await handleCheck()
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: '保存失败',
        description: error.message
      })
    } finally {
      setSaveLoading(false)
    }
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>发布管理</h2>
        <div className={styles.pathSelector}>
          <span className={styles.label}>项目路径:</span>
          <span className={styles.path}>{projectPath || '未选择'}</span>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectDirectory}
          >
            选择目录
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleCheck}
            loading={checking}
            disabled={!projectPath}
          >
            检查项目
          </Button>
        </div>
      </div>
      
      {checkResult && (
        <div className={styles.content}>
          <Card 
            title={
              <Space>
                <span>检查结果</span>
                {checkResult.packageInfo && (
                  <Switch
                    checked={editMode}
                    onChange={setEditMode}
                    checkedChildren={<EditOutlined />}
                    unCheckedChildren="查看"
                  />
                )}
              </Space>
            } 
            className={styles.checkCard}
            extra={
              editMode && (
                <Button 
                  type="primary" 
                  icon={<SaveOutlined />} 
                  onClick={handleSavePackageJson}
                  loading={saveLoading}
                >
                  保存
                </Button>
              )
            }
          >
            {checkResult.canPublish ? (
              <Alert
                message="项目检查通过"
                description="可以安全地发布此包"
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                message="项目检查未通过"
                description="请解决以下错误后再发布"
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            
            {editMode ? (
              <Form form={form} layout="vertical">
                <Form.Item name="name" label="包名" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="version" label="版本" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="description" label="描述">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="license" label="许可证">
                  <Input />
                </Form.Item>
                <Form.Item name="author" label="作者">
                  <Input />
                </Form.Item>
                <Form.Item name="homepage" label="主页">
                  <Input />
                </Form.Item>
                <Form.Item name="repository" label="仓库">
                  <Input />
                </Form.Item>
              </Form>
            ) : (
              <>
                {checkResult.packageInfo && (
                  <Descriptions bordered column={1} style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="包名">{checkResult.packageInfo.name}</Descriptions.Item>
                    <Descriptions.Item label="版本">{checkResult.packageInfo.version}</Descriptions.Item>
                    <Descriptions.Item label="描述">
                      {checkResult.packageInfo.description || '无'}
                    </Descriptions.Item>
                    <Descriptions.Item label="许可证">{checkResult.packageInfo.license || '无'}</Descriptions.Item>
                    <Descriptions.Item label="主入口">{checkResult.packageInfo.main || 'index.js'}</Descriptions.Item>
                  </Descriptions>
                )}
                
                {checkResult.errors.length > 0 && (
                  <div className={styles.errorList}>
                    <h4><WarningOutlined /> 错误 ({checkResult.errors.length})</h4>
                    {checkResult.errors.map((error: string, index: number) => (
                      <Tag key={index} color="error">{error}</Tag>
                    ))}
                  </div>
                )}
                
                {checkResult.warnings.length > 0 && (
                  <div className={styles.warningList}>
                    <h4>警告 ({checkResult.warnings.length})</h4>
                    {checkResult.warnings.map((warning: string, index: number) => (
                      <Tag key={index} color="warning">{warning}</Tag>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
          
          {checkResult.canPublish && !editMode && (
            <Card title="发布配置" className={styles.publishCard}>
              <Form
                form={form}
                onFinish={handlePublish}
                layout="vertical"
                initialValues={{ tag: 'latest', access: 'public' }}
              >
                <Form.Item name="tag" label="发布标签">
                  <Select>
                    <Select.Option value="latest">latest</Select.Option>
                    <Select.Option value="next">next</Select.Option>
                    <Select.Option value="beta">beta</Select.Option>
                    <Select.Option value="alpha">alpha</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="version"
                  label="发布版本号"
                  rules={[{ required: true, message: '请输入版本号' }]}
                  extra="发布前会写入 package.json"
                >
                  <Input placeholder="例如: 1.0.1" />
                </Form.Item>
                
                <Form.Item name="access" label="访问权限">
                  <Select>
                    <Select.Option value="public">公开</Select.Option>
                    <Select.Option value="restricted">受限（私有）</Select.Option>
                  </Select>
                </Form.Item>
                
                <Form.Item name="registry" label="Registry（可选）">
                  <Input placeholder="例如: https://registry.npmjs.org/" />
                </Form.Item>
                
                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<CloudUploadOutlined />}
                    loading={loading}
                    size="large"
                    block
                  >
                    发布到 npm
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          )}
        </div>
      )}
      
      {!checkResult && (
        <div className={styles.empty}>
          <p>选择项目目录并点击"检查项目"以开始发布流程</p>
        </div>
      )}
    </div>
  )
}

export default PublishPage
