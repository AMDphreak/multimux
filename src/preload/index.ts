import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  probeFile: (filePath: string) => ipcRenderer.invoke('probe-file', filePath),
  selectInputFile: () => ipcRenderer.invoke('select-input-file'),
  selectOutputFile: (defaultPath: string) => ipcRenderer.invoke('select-output-file', defaultPath),
  openExplorer: (filePath: string) => ipcRenderer.invoke('open-explorer', filePath),
  muxAudio: (options: any) => ipcRenderer.invoke('mux-audio', options),
  onMuxProgress: (callback: (data: { percent: number; rawLine: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('mux-progress', listener)
    return () => ipcRenderer.off('mux-progress', listener)
  },
  onMuxLog: (callback: (line: string) => void) => {
    const listener = (_event: any, line: string) => callback(line)
    ipcRenderer.on('mux-log', listener)
    return () => ipcRenderer.off('mux-log', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
