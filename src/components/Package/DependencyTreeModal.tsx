import React, { useState, useEffect } from 'react'
import { Modal, Tree, Spin, Input, Card, Tag, Empty, Space, Typography, Select, Button, Pagination, Tooltip } from 'antd'
import { ApartmentOutlined, GlobalOutlined, FolderOutlined, ExpandOutlined, CompressOutlined, LinkOutlined } from '@ant-design/icons'

const { Text } = Typography
const { Search } = Input

interface DependencyTreeModalProps {
  visible: boolean
  type: 'project' | 'global' | 'package'
  projectPath?: string
  packageName?: string
  onClose: () => void
}

export const DependencyTreeModal: React.FC<DependencyTreeModalProps> = ({
  visible,
  type,
  projectPath,
  packageName,
  onClose
}) => {
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<any>(null)
  const [searchText, setSearchText] = useState('')
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact'>('fuzzy')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [allKeys, setAllKeys] = useState<string[]>([])
  const [pageSize, setPageSize] = useState<number>(0) // 0 表示显示全部
  const [currentPage, setCurrentPage] = useState(1)
  
  useEffect(() => {
    if (visible) {
      loadDependencyTree()
    } else {
      // 重置状态
      setSearchText('')
      setExpandedKeys([])
      setCurrentPage(1)
    }
  }, [visible, type, projectPath, packageName])
  
  const loadDependencyTree = async () => {
    setLoading(true)
    try {
      let result: any = null
      
      if (type === 'project' && projectPath) {
        result = await window.electronAPI.npm.getProjectDependencyTree(projectPath, 3)
      } else if (type === 'global') {
        result = await window.electronAPI.npm.getGlobalDependencyTree(2)
      } else if (type === 'package' && packageName) {
        result = await window.electronAPI.npm.getDependencyTree(packageName, undefined, 3)
      }
      
      setTreeData(result)
      
      // 收集所有 key 用于展开
      const keys = collectAllKeys(result)
      setAllKeys(keys)
    } catch (error) {
      console.error('Failed to load dependency tree:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const collectAllKeys = (node: any, parentKey = ''): string[] => {
    if (!node) return []
    
    const dependencies = node.dependencies || {}
    const currentKey = parentKey ? `${parentKey}/${node.name || 'root'}` : 'root'
    let keys: string[] = []
    
    for (const [name, info] of Object.entries(dependencies)) {
      const depInfo = info as any
      const childKey = `${currentKey}/${name}`
      keys.push(childKey)
      
      if (depInfo.dependencies && Object.keys(depInfo.dependencies).length > 0) {
        keys = keys.concat(collectAllDependencies(depInfo, childKey))
      }
    }
    
    return keys
  }
  
  const collectAllDependencies = (node: any, parentKey: string): string[] => {
    const deps = node.dependencies || {}
    let keys: string[] = []
    
    for (const [name, info] of Object.entries(deps)) {
      const depInfo = info as any
      const childKey = `${parentKey}/${name}`
      keys.push(childKey)
      
      if (depInfo.dependencies && Object.keys(depInfo.dependencies).length > 0) {
        keys = keys.concat(collectAllDependencies(depInfo, childKey))
      }
    }
    
    return keys
  }
  
  const convertToAntdTree = (node: any, parentKey = ''): any[] => {
    if (!node) return []
    
    const dependencies = node.dependencies || {}
    const currentKey = parentKey ? `${parentKey}/${node.name || 'root'}` : 'root'
    
    const children: any[] = []
    
    for (const [name, info] of Object.entries(dependencies)) {
      const depInfo = info as any
      const childKey = `${currentKey}/${name}`
      const child: any = {
        title: (
          <Space>
            <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => handlePackageClick(name)}>
              {name}
            </Tag>
            <Text type="secondary">v{depInfo.version}</Text>
            <Tooltip title="查看包详情">
              <Button 
                type="link" 
                size="small" 
                icon={<LinkOutlined />}
                onClick={() => handlePackageClick(name)}
                style={{ padding: 0 }}
              />
            </Tooltip>
          </Space>
        ),
        key: childKey,
        name: name,
        version: depInfo.version,
        children: []
      }
      
      if (depInfo.dependencies && Object.keys(depInfo.dependencies).length > 0) {
        child.children = convertToAntdTree(depInfo, childKey)
      }
      
      children.push(child)
    }
    
    return children
  }
  
  const handlePackageClick = (packageName: string) => {
    window.electronAPI.openExternal(`https://www.npmjs.com/package/${packageName}`)
  }
  
  const filterTreeData = (data: any[], search: string, mode: 'fuzzy' | 'exact'): any[] => {
    if (!search) return data
    
    const searchLower = search.toLowerCase()
    
    const filterNode = (nodes: any[]): any[] => {
      return nodes.reduce((acc: any[], node) => {
        const nodeName = node.name?.toLowerCase() || ''
        const isMatch = mode === 'exact' 
          ? nodeName === searchLower
          : nodeName.includes(searchLower)
        
        let filteredChildren: any[] = []
        if (node.children && node.children.length > 0) {
          filteredChildren = filterNode(node.children)
        }
        
        if (isMatch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren
          })
        }
        
        return acc
      }, [])
    }
    
    return filterNode(data)
  }
  
  const handleExpandAll = () => {
    setExpandedKeys(allKeys)
  }
  
  const handleCollapseAll = () => {
    setExpandedKeys([])
  }
  
  const treeNodes = treeData ? convertToAntdTree(treeData) : []
  const filteredTree = filterTreeData(treeNodes, searchText, searchMode)
  
  // 分页处理
  const totalPackages = filteredTree.length
  const showPagination = pageSize > 0 && totalPackages > pageSize
  const startIndex = showPagination ? (currentPage - 1) * pageSize : 0
  const endIndex = showPagination ? startIndex + pageSize : totalPackages
  const displayedTree = showPagination ? filteredTree.slice(startIndex, endIndex) : filteredTree
  
  const totalDeps = treeData?.dependencies ? countAllDependencies(treeData) : 0
  
  function countAllDependencies(node: any): number {
    if (!node?.dependencies) return 0
    let count = Object.keys(node.dependencies).length
    for (const dep of Object.values(node.dependencies)) {
      count += countAllDependencies(dep)
    }
    return count
  }
  
  return (
    <Modal
      title={
        <Space>
          {type === 'project' && <><FolderOutlined /> 项目依赖树</>}
          {type === 'global' && <><GlobalOutlined /> 全局依赖树</>}
          {type === 'package' && <><ApartmentOutlined /> {packageName} 依赖树</>}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      <Spin spinning={loading}>
        {treeData && (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space split={<span style={{ color: '#999' }}>|</span>}>
                <span>直接依赖: <Tag color="blue">{totalPackages}</Tag></span>
                <span>全部依赖: <Tag color="green">{totalDeps}</Tag></span>
              </Space>
            </Card>
            
            <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
              <Space wrap>
                <Search
                  placeholder={searchMode === 'exact' ? '精确搜索包名...' : '模糊搜索包名...'}
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setCurrentPage(1)
                  }}
                  style={{ width: 300 }}
                  allowClear
                />
                <Select 
                  value={searchMode} 
                  onChange={setSearchMode}
                  style={{ width: 120 }}
                  options={[
                    { value: 'fuzzy', label: '模糊匹配' },
                    { value: 'exact', label: '精确匹配' }
                  ]}
                />
                <Button icon={<ExpandOutlined />} onClick={handleExpandAll}>
                  全部展开
                </Button>
                <Button icon={<CompressOutlined />} onClick={handleCollapseAll}>
                  全部折叠
                </Button>
              </Space>
              
              <Space>
                <Text type="secondary">分页:</Text>
                <Select 
                  value={pageSize} 
                  onChange={(val) => {
                    setPageSize(val)
                    setCurrentPage(1)
                  }}
                  style={{ width: 150 }}
                  options={[
                    { value: 0, label: '显示全部' },
                    { value: 20, label: '每页20条' },
                    { value: 50, label: '每页50条' },
                    { value: 100, label: '每页100条' }
                  ]}
                />
                {showPagination && (
                  <Text type="secondary">
                    显示 {startIndex + 1}-{Math.min(endIndex, totalPackages)} / 共 {totalPackages} 条
                  </Text>
                )}
              </Space>
            </Space>
            
            {displayedTree.length > 0 ? (
              <>
                <div style={{ maxHeight: 450, overflow: 'auto' }}>
                  <Tree
                    treeData={displayedTree}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys as string[])}
                    showLine
                    selectable
                    blockNode
                  />
                </div>
                
                {showPagination && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Pagination
                      current={currentPage}
                      pageSize={pageSize}
                      total={totalPackages}
                      onChange={(page) => setCurrentPage(page)}
                      showSizeChanger={false}
                      showQuickJumper
                    />
                  </div>
                )}
              </>
            ) : (
              <Empty description={searchText ? "没有找到匹配的依赖" : "暂无依赖数据"} />
            )}
          </>
        )}
        
        {!treeData && !loading && (
          <Empty description="暂无依赖数据" />
        )}
      </Spin>
    </Modal>
  )
}