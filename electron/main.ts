import { app, BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron'
import path from 'path'
import isDev from 'electron-is-dev'

let mainWindow: BrowserWindow | null = null
let isTracking = false
let isRecording = false
let mouseTrackingInterval: NodeJS.Timeout | null = null

function stopMouseTracking() {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
  }
  isTracking = false
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Handle window close
  mainWindow.on('closed', () => {
    stopMouseTracking()
    mainWindow = null
  })

  // Set up IPC handlers
  ipcMain.handle('GET_ALL_SOURCES', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 150, height: 150 }
      })
      return {
        success: true,
        sources: sources.map(source => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL()
        }))
      }
    } catch (error) {
      console.error('Error getting sources:', error)
      return { success: false, sources: [] }
    }
  })

  ipcMain.handle('CHECK_AUDIO_DRIVER', async () => {
    return { available: true, success: true }
  })

  ipcMain.handle('START_MOUSE_TRACKING', async () => {
    if (!isTracking && mainWindow && !mainWindow.isDestroyed()) {
      isTracking = true
      console.log('Mouse tracking started')
      
      mouseTrackingInterval = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed() && isTracking) {
          try {
            const mousePos = screen.getCursorScreenPoint()
            mainWindow.webContents.send('MOUSE_POSITION_UPDATE', {
              x: mousePos.x,
              y: mousePos.y,
              timestamp: Date.now()
            })
          } catch (error) {
            console.error('Error sending mouse position:', error)
            stopMouseTracking()
          }
        } else {
          stopMouseTracking()
        }
      }, 16)
    }
    return { success: true }
  })

  ipcMain.handle('STOP_MOUSE_TRACKING', async () => {
    stopMouseTracking()
    return { success: true }
  })

  ipcMain.handle('START_RECORDING', async () => {
    if (!isRecording) {
      isRecording = true
      console.log('Recording started')
    }
    return { success: true }
  })

  ipcMain.handle('STOP_RECORDING', async () => {
    if (isRecording) {
      isRecording = false
      console.log('Recording stopped')
    }
    return { success: true }
  })

  ipcMain.handle('GET_SELECTED_AREA', async () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size
      return {
        success: true,
        area: {
          x: 0,
          y: 0,
          width,
          height
        }
      }
    } catch (error) {
      console.error('Error getting selected area:', error)
      return { success: false, area: null }
    }
  })

  ipcMain.handle('start-recording', async () => {
    console.log('Starting recording...')
    return { success: true }
  })

  ipcMain.handle('stop-recording', async () => {
    console.log('Stopping recording...')
    return { success: true }
  })

  ipcMain.handle('save-recording', async (_, filePath) => {
    console.log('Saving recording to:', filePath)
    return { success: true }
  })

  // Video saving handler
  ipcMain.handle('SAVE_VIDEO', async (_, { blob, filePath }) => {
    try {
      console.log('Received save request:', {
        hasBlob: !!blob,
        blobType: blob ? typeof blob : 'undefined',
        filePath
      });

      if (!blob || !filePath) {
        throw new Error('Both blob and filePath are required');
      }

      // Convert array back to Buffer
      const buffer = Buffer.from(blob);
      
      console.log('Buffer created:', buffer.length, 'bytes');

      const downloadsPath = await app.getPath('downloads');
      const fullPath = path.join(downloadsPath, `${filePath}.webm`);

      console.log('Saving to:', fullPath);

      const fs = require('fs');
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, buffer);

      return {
        success: true,
        message: 'Video saved successfully',
        path: fullPath
      };
    } catch (error) {
      console.error('Error saving video:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}

// Clean up on app quit
app.on('before-quit', () => {
  stopMouseTracking()
})

// Clean up on window close
app.on('window-all-closed', () => {
  stopMouseTracking()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}) 