import React, { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, Modal, Space, Tag, Tree, Typography } from 'antd'
import { CompressOutlined, EditOutlined, ExpandOutlined, SearchOutlined } from '@ant-design/icons'

const { Text } = Typography

export interface TreeLikeNode {
  name: string
  version?: string
  dependencies?: TreeLikeNode[]
}

interface DependencyTreeViewerProps {
  visible: boolean
  title: React.ReactNode
  data: TreeLikeNode[] | TreeLikeNode | null
  onClose: () => void
  actionLabel?: string
  canNodeAction?: (node: TreeLikeNode) => boolean
  onNodeAction?: (node: TreeLikeNode) => void
}

export const DependencyTreeViewer: React.FC<DependencyTreeViewerProps> = ({
  visible,
  title,
  data,
  onClose,
  actionLabel,
  canNodeAction,
  onNodeAction
}) => {
  const [searchText, setSearchText] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const roots = useMemo(() => normalizeRoots(data), [data])
  const treeData = useMemo(() => convertTree(roots, 'root', actionLabel, onNodeAction, canNodeAction), [roots, actionLabel, onNodeAction, canNodeAction])
  const allKeys = useMemo(() => collectKeys(treeData), [treeData])
  const filteredTree = useMemo(() => filterTree(treeData, searchText), [treeData, searchText])
  const totalCount = useMemo(() => countNodes(roots), [roots])

  useEffect(() => {
    if (!visible) {
      setSearchText('')
      setExpandedKeys([])
    }
  }, [visible])

  const handleExpandAll = () => setExpandedKeys(allKeys)
  const handleCollapseAll = () => setExpandedKeys([])

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={960}
    >
      {roots.length === 0 ? (
        <Empty description="暂无依赖树数据" />
      ) : (
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索包名"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 260 }}
            />
            <Button icon={<ExpandOutlined />} onClick={handleExpandAll}>全部展开</Button>
            <Button icon={<CompressOutlined />} onClick={handleCollapseAll}>全部折叠</Button>
            <Text type="secondary">总节点: {totalCount}</Text>
          </Space>
          <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid var(--border-color, #3c3c3c)', borderRadius: 8, padding: 12 }}>
            {filteredTree.length > 0 ? (
              <Tree
                treeData={filteredTree}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                blockNode
                showLine
              />
            ) : (
              <Empty description="没有找到匹配的依赖" />
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function normalizeRoots(data: TreeLikeNode[] | TreeLikeNode | null): TreeLikeNode[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return [data]
}

function convertTree(
  nodes: TreeLikeNode[],
  parentKey = 'root',
  actionLabel?: string,
  onNodeAction?: (node: TreeLikeNode) => void,
  canNodeAction?: (node: TreeLikeNode) => boolean
): any[] {
  return nodes.map((node, index) => {
    const key = `${parentKey}/${node.name || index}`
    return {
      key,
      name: node.name,
      title: (
        <Space size={8}>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{node.name}</Tag>
          <Text type="secondary">{node.version || 'unknown'}</Text>
          {onNodeAction && (!canNodeAction || canNodeAction(node)) && (
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onNodeAction(node)
              }}
            >
              {actionLabel || '修改'}
            </Button>
          )}
        </Space>
      ),
      children: convertTree(node.dependencies || [], key, actionLabel, onNodeAction, canNodeAction)
    }
  })
}

function filterTree(nodes: any[], searchText: string): any[] {
  const query = searchText.trim().toLowerCase()
  if (!query) return nodes

  const walk = (items: any[]): any[] => {
    return items.reduce((acc: any[], item) => {
      const match = String(item.name || '').toLowerCase().includes(query)
      const children = item.children?.length ? walk(item.children) : []
      if (match || children.length > 0) {
        acc.push({ ...item, children })
      }
      return acc
    }, [])
  }

  return walk(nodes)
}

function collectKeys(nodes: any[]): string[] {
  const keys: string[] = []
  const walk = (items: any[]) => {
    for (const item of items) {
      keys.push(item.key)
      if (item.children?.length) walk(item.children)
    }
  }
  walk(nodes)
  return keys
}

function countNodes(nodes: TreeLikeNode[]): number {
  let total = 0
  const walk = (items: TreeLikeNode[]) => {
    for (const item of items) {
      total += 1
      if (item.dependencies?.length) walk(item.dependencies)
    }
  }
  walk(nodes)
  return total
}
