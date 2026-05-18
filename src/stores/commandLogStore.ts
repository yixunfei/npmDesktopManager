import { create } from 'zustand'

export interface CommandLogEntry {
  id: string
  timestamp: number
  lastTimestamp?: number
  command: string
  output?: string
  error?: string
  status: 'running' | 'success' | 'error'
  repeatCount?: number
  resolved?: boolean
  repairStatus?: 'running' | 'sent' | 'failed'
}

interface CommandLogState {
  logs: CommandLogEntry[]
  visible: boolean
  maxLogs: number
  
  addLog: (command: string, status?: 'running' | 'success' | 'error', output?: string, error?: string, id?: string) => string
  updateLog: (id: string, updates: Partial<CommandLogEntry>) => void
  removeLog: (id: string) => void
  clearStatus: (status: CommandLogEntry['status']) => void
  clearResolved: () => void
  clearLogs: () => void
  setVisible: (visible: boolean) => void
  toggleVisible: () => void
}

export const useCommandLogStore = create<CommandLogState>((set) => ({
  logs: [],
  visible: false,
  maxLogs: 200,
  
  addLog: (command: string, status: 'running' | 'success' | 'error' = 'running', output?: string, error?: string, id?: string) => {
    const logId = id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const newLog: CommandLogEntry = {
      id: logId,
      timestamp: Date.now(),
      lastTimestamp: Date.now(),
      command,
      output,
      error,
      status,
      repeatCount: 1
    }
    
    set((state) => {
      const existingIndex = state.logs.findIndex(log => log.id === logId)
      let newLogs: CommandLogEntry[]
      
      if (existingIndex >= 0) {
        newLogs = [...state.logs]
        const previous = newLogs[existingIndex]
        newLogs[existingIndex] = {
          ...previous,
          ...newLog,
          timestamp: previous.timestamp,
          repeatCount: previous.repeatCount || 1,
          resolved: status === 'error' ? previous.resolved : false,
          repairStatus: previous.repairStatus
        }
      } else if (status === 'error') {
        const duplicateIndex = state.logs.findIndex((log) => isDuplicateError(log, newLog))
        if (duplicateIndex >= 0) {
          newLogs = [...state.logs]
          const previous = newLogs[duplicateIndex]
          newLogs[duplicateIndex] = {
            ...previous,
            output: newLog.output || previous.output,
            error: newLog.error || previous.error,
            lastTimestamp: newLog.lastTimestamp,
            repeatCount: (previous.repeatCount || 1) + 1,
            resolved: false
          }
        } else {
          newLogs = [...state.logs, newLog].slice(-state.maxLogs)
        }
      } else {
        newLogs = [...state.logs, newLog].slice(-state.maxLogs)
      }
      
      return { logs: newLogs }
    })
    
    return logId
  },
  
  updateLog: (id: string, updates: Partial<CommandLogEntry>) => {
    set((state) => ({
      logs: state.logs.map((log) =>
        log.id === id ? { ...log, ...updates } : log
      )
    }))
  },

  removeLog: (id: string) => {
    set((state) => ({
      logs: state.logs.filter((log) => log.id !== id)
    }))
  },

  clearStatus: (status: CommandLogEntry['status']) => {
    set((state) => ({
      logs: state.logs.filter((log) => log.status !== status)
    }))
  },

  clearResolved: () => {
    set((state) => ({
      logs: state.logs.filter((log) => !log.resolved)
    }))
  },
  
  clearLogs: () => {
    set({ logs: [] })
  },
  
  setVisible: (visible: boolean) => {
    set({ visible })
  },
  
  toggleVisible: () => {
    set((state) => ({ visible: !state.visible }))
  }
}))

function isDuplicateError(existing: CommandLogEntry, incoming: CommandLogEntry): boolean {
  if (existing.status !== 'error' || incoming.status !== 'error') return false
  if (existing.command !== incoming.command) return false
  return normalizeErrorSignature(existing.error || existing.output) === normalizeErrorSignature(incoming.error || incoming.output)
}

function normalizeErrorSignature(value?: string): string {
  return (value || '')
    .replace(/\d{1,2}:\d{2}:\d{2}(?:\.\d+)?/g, '')
    .replace(/\b\d{4}-\d{2}-\d{2}[^\s]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}
