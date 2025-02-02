import { app, BrowserWindow, ipcMain, desktopCapturer, screen, systemPreferences } from 'electron'
import path from 'path'
import isDev from 'electron-is-dev'
import { MousePosition } from '../src/types'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Add these variables at the top with other state variables
let isPreviewOnRight = false;
const PREVIEW_WIDTH = 340;
const PREVIEW_HEIGHT = 660;
const BOUNDARY_THRESHOLD = 300; // pixels from right edge to trigger move

let mainWindow: BrowserWindow | null = null
let isTracking = false
let isRecording = false
let mouseTrackingInterval: NodeJS.Timeout | null = null

// Update the original window state interface
interface WindowState {
    width: number;
    height: number;
    resizable: boolean;
    alwaysOnTop: boolean;
    skipTaskbar: boolean;
    backgroundColor: string;
  }

// Add these variables to store the original window state
let originalWindowState: WindowState = {
    width: 800,
    height: 600,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: '#ffffff'
  };

function stopMouseTracking() {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
  }
  isTracking = false
}

const waitForDevServer = async (url: string, maxAttempts = 30): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log('Dev server is ready!');
        return true;
      }
    } catch (error) {
      console.log(`Waiting for dev server... attempt ${attempt + 1}/${maxAttempts}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error('Dev server failed to start after maximum attempts');
  return false;
};

// Add IPC handlers
const setupIpcHandlers = () => {
  // Check for BlackHole audio driver on macOS
  ipcMain.handle('CHECK_AUDIO_DRIVER', async () => {
    if (process.platform === 'darwin') {
      const devices = await systemPreferences.getMediaAccessStatus('microphone');
      return devices === 'granted';
    }
    return true;
  });

  // Get all screen sources
  ipcMain.handle('GET_ALL_SOURCES', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return { sources };
  });

  // Mouse tracking handlers
  ipcMain.handle('START_MOUSE_TRACKING', () => {
    if (!isTracking && mainWindow) {
      isTracking = true;
      mouseTrackingInterval = setInterval(() => {
        const mousePos = screen.getCursorScreenPoint();
        mainWindow?.webContents.send('MOUSE_POSITION_UPDATE', {
          x: mousePos.x,
          y: mousePos.y,
          timestamp: Date.now()
        } as MousePosition);
      }, 16); // ~60fps
    }
  });

  ipcMain.handle('STOP_MOUSE_TRACKING', () => {
    stopMouseTracking();
  });

  // Recording state handlers
  ipcMain.handle('START_RECORDING', () => {
    isRecording = true;
  });

  ipcMain.handle('STOP_RECORDING', () => {
    isRecording = false;
  });

  // Area selection handlers
  let selectedArea: { x: number; y: number; width: number; height: number } | null = null;

  ipcMain.handle('START_AREA_SELECTION', () => {
    // Implementation for area selection
    selectedArea = null;
    return true;
  });

  ipcMain.handle('AREA_SELECTED', (_, area) => {
    selectedArea = area;
    return true;
  });

  ipcMain.handle('GET_SELECTED_AREA', () => {
    return selectedArea;
  });

  ipcMain.handle('CANCEL_SELECTION', () => {
    selectedArea = null;
    return true;
  });

  // Save video handler
  ipcMain.handle('SAVE_VIDEO', async (_, { buffer, format, quality, fps }) => {
    // Implementation for saving video
    // You'll need to implement this based on your requirements
    return true;
  });
};

const createWindow = async (): Promise<void> => {
  if (isDev) {
    const devServerReady = await waitForDevServer('http://localhost:5173');
    if (!devServerReady) {
      console.error('Dev server not ready, exiting...');
      app.quit();
      return;
    }
  }

  mainWindow = new BrowserWindow({
    width: originalWindowState.width,
    height: originalWindowState.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Store initial window state
  const bounds = mainWindow.getBounds();
  originalWindowState = {
    width: bounds.width,
    height: bounds.height,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: '#ffffff'
  };

  // Update permission handler
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'screen', 'audioCapture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Add specific permission check for desktop capture
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'screen', 'audioCapture'].includes(permission);
  });

  // Enable system audio capture for macOS
  if (process.platform === 'darwin') {
    mainWindow.webContents.on('did-start-navigation', () => {
      systemPreferences.askForMediaAccess('microphone');
    });
  }
};

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

app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}); 