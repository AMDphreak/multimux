import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { probeFile, muxAudio } from './muxer'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'multimux',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.multimux')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  ipcMain.handle('probe-file', async (_event, filePath: string) => {
    return await probeFile(filePath)
  })

  ipcMain.handle('select-input-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Input Video File',
      properties: ['openFile'],
      filters: [
        {
          name: 'Supported Video Containers (*.mkv, *.mp4, *.ts, *.mov)',
          extensions: ['mkv', 'mp4', 'ts', 'mov']
        },
        { name: 'Matroska Video (*.mkv)', extensions: ['mkv'] },
        { name: 'MPEG-4 Video (*.mp4)', extensions: ['mp4'] },
        { name: 'MPEG Transport Stream (*.ts)', extensions: ['ts'] },
        { name: 'QuickTime Movie (*.mov)', extensions: ['mov'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return undefined
    }
    return result.filePaths[0]
  })

  ipcMain.handle('select-output-file', async (_event, defaultPath: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Select Output Path',
      defaultPath: defaultPath,
      filters: [
        { name: 'Matroska Video (*.mkv)', extensions: ['mkv'] },
        { name: 'MPEG-4 Video (*.mp4)', extensions: ['mp4'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    })
    return result.filePath
  })

  ipcMain.handle('open-explorer', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('mux-audio', async (event, options) => {
    const webContents = event.sender
    return await muxAudio(
      options,
      (percent, rawLine) => {
        if (!webContents.isDestroyed()) {
          webContents.send('mux-progress', { percent, rawLine })
        }
      },
      (line) => {
        if (!webContents.isDestroyed()) {
          webContents.send('mux-log', line)
        }
      }
    )
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
