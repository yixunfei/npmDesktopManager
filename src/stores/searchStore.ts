import { create } from 'zustand'

export interface SearchResult {
  name: string
  version: string
  description: string
  author?: string
  date?: string
  keywords?: string[]
}

interface SearchState {
  results: SearchResult[]
  selectedPackage: any | null
  loading: boolean
  
  search: (query: string) => Promise<void>
  viewPackage: (packageName: string) => Promise<void>
  clearResults: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  results: [],
  selectedPackage: null,
  loading: false,
  
  search: async (query: string) => {
    if (!query.trim()) {
      set({ results: [] })
      return
    }
    
    set({ loading: true })
    try {
      const results = await window.electronAPI.npm.search(query)
      set({ results: results || [] })
    } catch (error) {
      console.error('Search failed:', error)
      set({ results: [] })
    } finally {
      set({ loading: false })
    }
  },
  
  viewPackage: async (packageName: string) => {
    set({ loading: true })
    try {
      const info = await window.electronAPI.npm.view(packageName)
      set({ selectedPackage: info })
    } catch (error) {
      console.error('Failed to view package:', error)
      set({ selectedPackage: null })
    } finally {
      set({ loading: false })
    }
  },
  
  clearResults: () => set({ results: [], selectedPackage: null })
}))