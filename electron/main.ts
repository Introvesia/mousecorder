import { app, BrowserWindow, ipcMain, desktopCapturer, screen, systemPreferences, dialog } from 'electron'
import path from 'path'
import isDev from 'electron-is-dev'
import { MousePosition } from '../src/types'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

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

// Get the correct ffmpeg path based on development or production
const getFfmpegPath = () => {
  if (isDev) {
    return require('ffmpeg-static');
  } else {
    // In production, ffmpeg is in resources directory
    return path.join(process.resourcesPath, 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  }
};

// Add IPC handlers
const setupIpcHandlers = () => {
  // Check for audio permissions and devices
  ipcMain.handle('CHECK_AUDIO_DRIVER', async () => {
    try {
      if (process.platform === 'darwin') {
        // Request microphone access first
        await systemPreferences.askForMediaAccess('microphone');
        const status = await systemPreferences.getMediaAccessStatus('microphone');
        console.log('Microphone access status:', status);
        
        // Get audio devices
        const devices = await mainWindow?.webContents.executeJavaScript(`
          navigator.mediaDevices.enumerateDevices()
            .then(devices => devices.filter(d => d.kind === 'audioinput'))
        `);
        console.log('Available audio devices:', devices);
        
        return {
          permission: status === 'granted',
          devices: devices || []
        };
      }
      return { permission: true, devices: [] };
    } catch (error) {
      console.error('Error checking audio permissions:', error);
      return { permission: false, devices: [], error: error.message };
    }
  });

  // Get all screen sources
  ipcMain.handle('GET_ALL_SOURCES', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 },
        fetchWindowIcons: true
      });

      // Get audio devices if on macOS
      let audioDevices = [];
      if (process.platform === 'darwin') {
        audioDevices = await mainWindow?.webContents.executeJavaScript(`
          navigator.mediaDevices.enumerateDevices()
            .then(devices => devices.filter(d => d.kind === 'audioinput'))
        `);
      }

      return { 
        sources,
        audioDevices: audioDevices || []
      };
    } catch (error) {
      console.error('Error getting sources:', error);
      throw error;
    }
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
    mainWindow?.webContents.setBackgroundThrottling(false);
  });

  ipcMain.handle('STOP_RECORDING', () => {
    isRecording = false;
    mainWindow?.webContents.setBackgroundThrottling(true);
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
    try {
      // Set ffmpeg path
      const ffmpegPath = getFfmpegPath();
      console.log('Using ffmpeg path:', ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);

      // Generate timestamp for filename
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')  // Replace colons and periods with hyphens
        .replace('T', '_')      // Replace T with underscore
        .slice(0, -5);          // Remove milliseconds and timezone

      // Show save dialog with timestamped default filename
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Recording',
        defaultPath: `recording_${timestamp}.${format}`,
        filters: [
          { name: 'Video Files', extensions: [format] }
        ]
      });

      if (canceled || !filePath) {
        return false;
      }

      // Save the buffer to a temporary file
      const tempPath = path.join(app.getPath('temp'), `temp-${Date.now()}.webm`);
      await fs.promises.writeFile(tempPath, Buffer.from(buffer));

      // Convert video based on settings
      return new Promise((resolve, reject) => {
        const command = ffmpeg(tempPath);

        // Apply quality settings
        switch (quality) {
          case 'high':
            command.videoBitrate('2500k');
            break;
          case 'medium':
            command.videoBitrate('1500k');
            break;
          case 'low':
            command.videoBitrate('800k');
            break;
        }

        // Set FPS
        command.fps(fps);

        // Progress handler
        command.on('progress', (progress) => {
          mainWindow?.webContents.send('CONVERSION_PROGRESS', Math.round(progress.percent));
        });

        command
          .output(filePath)
          .on('end', () => {
            // Clean up temp file
            fs.unlink(tempPath, (err) => {
              if (err) console.error('Error deleting temp file:', err);
            });
            resolve(filePath);
          })
          .on('error', (err) => {
            console.error('Error converting video:', err);
            reject(err);
          })
          .run();
      });
    } catch (error) {
      console.error('Error saving video:', error);
      throw error;
    }
  });
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: originalWindowState.width,
    height: originalWindowState.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      backgroundThrottling: false
    },
  });

  // Add window focus/blur handlers
  mainWindow.on('blur', () => {
    if (isRecording) {
      // Keep window active when recording
      mainWindow?.webContents.setBackgroundThrottling(false);
    }
  });

  mainWindow.on('focus', () => {
    if (!isRecording) {
      // Re-enable throttling when not recording
      mainWindow?.webContents.setBackgroundThrottling(true);
    }
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

  // Set up permissions
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'screen', 'audioCapture'];
    if (allowedPermissions.includes(permission)) {
      console.log(`Granting permission: ${permission}`);
      callback(true);
    } else {
      console.log(`Denying permission: ${permission}`);
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'screen', 'audioCapture'];
    const isAllowed = allowedPermissions.includes(permission);
    console.log(`Permission check for ${permission}: ${isAllowed}`);
    return isAllowed;
  });

  // Request audio permissions early
  if (process.platform === 'darwin') {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        await systemPreferences.askForMediaAccess('microphone');
        const status = await systemPreferences.getMediaAccessStatus('microphone');
        console.log('Initial microphone access status:', status);
      } catch (error) {
        console.error('Error requesting microphone access:', error);
      }
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