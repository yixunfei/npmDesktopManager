import { create } from 'zustand'

export interface CommandLogEntry {
  id: string
  timestamp: number
  command: string
  output?: string
  error?: string
  status: 'running' | 'success' | 'error'
}

interface CommandLogState {
  logs: CommandLogEntry[]
  visible: boolean
  maxLogs: number
  
  addLog: (command: string, status?: 'running' | 'success' | 'error', output?: string, error?: string, id?: string) => string
  updateLog: (id: string, updates: Partial<CommandLogEntry>) => void
  clearLogs: () => void
  setVisible: (visible: boolean) => void
  toggleVisible: () => void
}

export const useCommandLogStore = create<CommandLogState>((set) => ({
  logs: [],
  visible: false,
  maxLogs: 100,
  
  addLog: (command: string, status: 'running' | 'success' | 'error' = 'running', output?: string, error?: string, id?: string) => {
    const logId = id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const newLog: CommandLogEntry = {
      id: logId,
      timestamp: Date.now(),
      command,
      output,
      error,
      status
    }
    
    set((state) => {
      const existingIndex = state.logs.findIndex(log => log.id === logId)
      let newLogs: CommandLogEntry[]
      
      if (existingIndex >= 0) {
        newLogs = [...state.logs]
        newLogs[existingIndex] = newLog
      } else {
        newLogs = [newLog, ...state.logs].slice(0, state.maxLogs)
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
