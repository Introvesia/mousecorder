import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, systemPreferences, screen } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import type { FfmpegCommand } from 'fluent-ffmpeg';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Add these variables at the top with other state variables
let isPreviewOnRight = false;
const PREVIEW_WIDTH = 340;
const PREVIEW_HEIGHT = 660;
const BOUNDARY_THRESHOLD = 300; // pixels from right edge to trigger move

// Set ffmpeg path directly
if (ffmpegStatic) {
  console.log('Setting FFmpeg path to:', ffmpegStatic);
  ffmpeg.setFfmpegPath(ffmpegStatic);
  ffmpeg.setFfprobePath(ffprobe.path);
  console.log('Setting FFprobe path to:', ffprobe.path);
} else {
  console.error('FFmpeg path not found');
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let selectionWindow: BrowserWindow | null = null;
let selectedArea: { x: number; y: number; width: number; height: number } | null = null;
let mouseTrackingInterval: NodeJS.Timeout | null = null;

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

// Add missing interface
interface CodecData {
  duration: string;
  format?: string;
  audio?: string;
  video?: string;
}

const createSelectionWindow = (): BrowserWindow => {
  console.log('Creating selection window');
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreen: true,
    closable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
    },
    hasShadow: false,
    enableLargerThanScreen: true,
    visualEffectState: 'active'
  });

  // Don't show in dock on macOS
  if (process.platform === 'darwin') {
    console.log('Setting up macOS-specific window properties');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    app.dock.hide();
  }

  win.setIgnoreMouseEvents(false);
  win.setFullScreen(true);
  
  const selectionHtmlPath = path.join(__dirname, 'selection.html');
  console.log('Loading selection HTML from:', selectionHtmlPath);
  win.loadFile(selectionHtmlPath);

  win.webContents.on('did-finish-load', () => {
    console.log('Selection window loaded');
  });

  win.on('closed', () => {
    console.log('Selection window closed');
    selectionWindow = null;
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });

  return win;
};

const createWindow = (): void => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: originalWindowState.width,
    height: originalWindowState.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      webSecurity: true,
    },
  });

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

  // Only open DevTools in development
  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools();
  // }

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

// Update the handlers to use a consistent way to close the window
const closeSelectionWindow = () => {
  if (selectionWindow) {
    selectionWindow.destroy();
    selectionWindow = null;
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  }
};

// Add this function to handle preview window positioning
const updatePreviewPosition = (mouseX: number, isAutoMove: boolean) => {
  if (!mainWindow) return;

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().bounds;

  if (isAutoMove) {
    const isNearRightEdge = screenWidth - mouseX <= BOUNDARY_THRESHOLD;

    if (isNearRightEdge !== isPreviewOnRight) {
      isPreviewOnRight = isNearRightEdge;
      
      if (isPreviewOnRight) {
        // Move to left side
        mainWindow.setPosition(20, 20);
      } else {
        // Move to right side
        mainWindow.setPosition(screenWidth - PREVIEW_WIDTH - 20, 20);
      }
    }
  } else {
    // Center the window on screen
    const x = Math.round((screenWidth - PREVIEW_WIDTH) / 2);
    const y = Math.round((screenHeight - PREVIEW_HEIGHT) / 2);
    mainWindow.setPosition(x, y);
    isPreviewOnRight = false;
  }
};

// Update the AREA_SELECTED handler
ipcMain.handle('AREA_SELECTED', async (_, area) => {
  console.log('AREA_SELECTED handler called with:', area);
  if (!area || typeof area.x !== 'number' || typeof area.y !== 'number' || 
      typeof area.width !== 'number' || typeof area.height !== 'number') {
    console.error('Invalid area selection received:', area);
    return null;
  }
  
  // Store the selected area globally
  selectedArea = {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height
  };
  console.log('Stored selected area:', selectedArea);
  
  closeSelectionWindow();
  return area;
});

// Update the CANCEL_SELECTION handler
ipcMain.handle('CANCEL_SELECTION', async () => {
  closeSelectionWindow();
  return null;
});

// Update the START_RECORDING handler
ipcMain.handle('START_RECORDING', async () => {
  console.log('START_RECORDING handler called');
  if (mainWindow) {
    // Store original window state
    const bounds = mainWindow.getBounds();
    originalWindowState = {
      width: bounds.width,
      height: bounds.height,
      resizable: mainWindow.isResizable(),
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      skipTaskbar: false,
      backgroundColor: '#ffffff'
    };

    // Get screen dimensions once
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().bounds;

    // Set recording window state
    mainWindow.setSize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    
    // Center the window initially
    const x = Math.round((screenWidth - PREVIEW_WIDTH) / 2);
    const y = Math.round((screenHeight - PREVIEW_HEIGHT) / 2);
    mainWindow.setPosition(x, y);
    isPreviewOnRight = false;

    // Start listening for mouse position with auto-move state
    ipcMain.handle('MOUSE_POSITION_UPDATE', (_, data) => {
      updatePreviewPosition(data.x, data.autoMove);
    });

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setBackgroundColor('#00000000');
    mainWindow.setResizable(false);
    mainWindow.setSkipTaskbar(true);
    
    // Disable window controls during recording
    mainWindow.setClosable(false);
    mainWindow.setMinimizable(false);
    mainWindow.setMaximizable(false);
    
    // Hide DevTools if open
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    }
  }
});

// Update the STOP_RECORDING handler
ipcMain.handle('STOP_RECORDING', async () => {
  console.log('STOP_RECORDING handler called');
  if (mainWindow) {
    try {
      // Remove mouse position listener
      ipcMain.removeHandler('MOUSE_POSITION_UPDATE');
      isPreviewOnRight = false;

      // Restore original window state
      mainWindow.setSize(originalWindowState.width, originalWindowState.height);
      mainWindow.center();
      mainWindow.setResizable(originalWindowState.resizable);
      mainWindow.setAlwaysOnTop(originalWindowState.alwaysOnTop);
      mainWindow.setSkipTaskbar(originalWindowState.skipTaskbar);
      mainWindow.setBackgroundColor(originalWindowState.backgroundColor);
      mainWindow.setWindowButtonVisibility(true);
      
      // Enable window controls
      mainWindow.setClosable(true);
      mainWindow.setMinimizable(true);
      mainWindow.setMaximizable(originalWindowState.resizable);
      
      // Force window to be closable
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: 'allow' };
      });

      // Show DevTools only in development
      // if (process.env.NODE_ENV === 'development') {
      //   mainWindow.webContents.openDevTools();
      // }

      // Wait a bit to ensure all window properties are applied
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force window update
      mainWindow.setSize(originalWindowState.width, originalWindowState.height);
      mainWindow.center();
    } catch (error) {
      console.error('Error restoring window state:', error);
    }
  }
});

// Update the START_AREA_SELECTION handler
ipcMain.handle('START_AREA_SELECTION', async () => {
  console.log('START_AREA_SELECTION handler called');
  
  // Check screen capture permission on macOS
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    console.log('macOS screen capture permission status:', status);
    
    if (status !== 'granted') {
      console.log('Screen capture permission not granted, showing dialog');
      
      // Show dialog to guide user
      const response = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Screen Recording Permission Required',
        message: 'Screen recording permission is required.',
        detail: 'Please enable screen recording permission for this app in System Preferences > Security & Privacy > Privacy > Screen Recording.',
        buttons: ['Open System Preferences', 'Cancel']
      });

      if (response === 0) {
        // Open System Preferences
        exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        
        console.log('Waiting for screen capture permission...');
        // Wait for permission to be granted
        try {
          await new Promise<void>((resolve, reject) => {
            const checkPermission = setInterval(() => {
              const newStatus = systemPreferences.getMediaAccessStatus('screen');
              console.log('Checking permission status:', newStatus);
              if (newStatus === 'granted') {
                clearInterval(checkPermission);
                resolve();
              }
            }, 1000);

            // Timeout after 30 seconds
            setTimeout(() => {
              clearInterval(checkPermission);
              reject(new Error('Permission request timed out'));
            }, 30000);
          });
        } catch (error) {
          console.log('Permission request failed:', error);
          return null;
        }
      } else {
        console.log('User cancelled permission request');
        return null;
      }
    }
  }

  console.log('Creating selection window...');
  if (selectionWindow) {
    console.log('Closing existing selection window');
    closeSelectionWindow();
  }
  
  return new Promise((resolve) => {
    console.log('Setting up selection window and handlers');
    selectionWindow = createSelectionWindow();
    
    // Create one-time handlers
    const handleAreaSelected = (_: any, area: any) => {
      console.log('Area selected handler called with:', area);
      ipcMain.removeListener('AREA_SELECTED', handleAreaSelected);
      ipcMain.removeListener('CANCEL_SELECTION', handleCancel);
      resolve(area);
    };

    const handleCancel = () => {
      console.log('Cancel handler called');
      ipcMain.removeListener('AREA_SELECTED', handleAreaSelected);
      ipcMain.removeListener('CANCEL_SELECTION', handleCancel);
      resolve(null);
    };

    // Add the handlers
    ipcMain.once('AREA_SELECTED', handleAreaSelected);
    ipcMain.once('CANCEL_SELECTION', handleCancel);

    // Add timeout to prevent hanging
    setTimeout(() => {
      console.log('Selection window timed out');
      ipcMain.removeListener('AREA_SELECTED', handleAreaSelected);
      ipcMain.removeListener('CANCEL_SELECTION', handleCancel);
      if (selectionWindow) {
        closeSelectionWindow();
      }
      resolve(null);
    }, 300000); // 5 minute timeout
  });
});

// Also update the GET_SYSTEM_AUDIO_ACCESS handler
ipcMain.handle('GET_SYSTEM_AUDIO_ACCESS', async () => {
  if (process.platform === 'darwin') {
    const screenAccess = systemPreferences.getMediaAccessStatus('screen');
    // Only check microphone access for system audio
    const micAccess = await systemPreferences.askForMediaAccess('microphone');
    
    return screenAccess === 'granted' && micAccess;
  }
  return true;
});

// Update GET_SOURCES handler
ipcMain.handle('GET_ALL_SOURCES', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    return {
      sources: sources.map(source => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id
      }))
    };
  } catch (error) {
    console.error('Error getting sources:', error);
    throw error;
  }
});

interface ConversionProgress {
  frames: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
  percent?: number;
}

// Add type for the command handler
const handleFFmpegCommand = (cmd: FfmpegCommand) => {
  return new Promise<void>((resolve, reject) => {
    cmd
      .on('start', (commandLine: string) => {
        console.log('FFmpeg started:', commandLine);
      })
      .on('progress', (progress: ConversionProgress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('CONVERSION_PROGRESS', {
            percent: progress.percent || 0
          });
        }
      })
      .on('end', () => {
        console.log('FFmpeg processing finished');
        resolve();
      })
      .on('error', (err: Error) => {
        console.error('FFmpeg error:', err);
        reject(err);
      });
  });
};

// Add type for the data handler
const handleStreamData = (data: Buffer) => {
  console.log('Received data chunk:', data.length, 'bytes');
  // Process data as needed
};

// Update the SAVE_VIDEO handler
ipcMain.handle('SAVE_VIDEO', async (_, { buffer, format, quality, fps }) => {
  try {
    // Create temp file for WebM
    const tempWebmPath = path.join(app.getPath('temp'), `temp-${Date.now()}.webm`);
    await require('fs').promises.writeFile(tempWebmPath, buffer);

    // Get save path from user
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `recording-${Date.now()}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    });

    if (canceled || !filePath) {
      require('fs').unlink(tempWebmPath, () => {});
      throw new Error('Save cancelled');
    }

    if (format === 'mp4') {
      const outputPath = filePath.endsWith('.mp4') ? filePath : `${filePath}.mp4`;
      
      let totalDuration = 0;
      let startTime = Date.now();

      const command = ffmpeg(tempWebmPath)
        .outputOptions([
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
          '-y'
        ])
        .on('start', (cmd: string) => {
          console.log('FFmpeg started with command:', cmd);
        })
        .on('codecData', (data: CodecData) => {
          console.log('Input codec data:', data);
          // Get duration in seconds
          const timeParts = data.duration.split(':').map(Number);
          totalDuration = (timeParts[0] * 3600) + (timeParts[1] * 60) + timeParts[2];
          console.log('Total duration:', totalDuration, 'seconds');
        })
        .on('progress', (progress: ConversionProgress) => {
          // Extract current time in seconds
          const timeMatch = progress.timemark.match(/(\d+):(\d+):(\d+)\.(\d+)/);
          if (timeMatch) {
            const [, hours, minutes, seconds] = timeMatch.map(Number);
            const currentTime = (hours * 3600) + (minutes * 60) + seconds;

            if (totalDuration > 0) {
              // Use video duration for progress
              const percent = Math.min((currentTime / totalDuration) * 100, 99);
              mainWindow?.webContents.send('CONVERSION_PROGRESS', percent);
            } else {
              // Fallback to elapsed time estimation
              const elapsedMs = Date.now() - startTime;
              const estimatedPercent = Math.min((elapsedMs / 5000) * 100, 99);
              mainWindow?.webContents.send('CONVERSION_PROGRESS', estimatedPercent);
            }
          }
        });

      await new Promise<void>((resolve, reject) => {
        command
          .on('end', () => {
            console.log('FFmpeg processing finished');
            mainWindow?.webContents.send('CONVERSION_PROGRESS', 100);
            
            setTimeout(() => {
              require('fs').unlink(tempWebmPath, (err: NodeJS.ErrnoException | null) => {
                if (err) console.error('Error deleting temp file:', err);
              });
              resolve();
            }, 500);
          })
          .on('error', (err: Error) => {
            console.error('FFmpeg error:', err);
            require('fs').unlink(tempWebmPath, () => {});
            reject(err);
          })
          .save(outputPath);
      });

      return outputPath;
    } else {
      const outputPath = filePath.endsWith('.webm') ? filePath : `${filePath}.webm`;
      await require('fs').promises.rename(tempWebmPath, outputPath);
      return outputPath;
    }
  } catch (error) {
    console.error('Error saving video:', error);
    throw error;
  }
});

// Add this new IPC handler
ipcMain.handle('CHECK_AUDIO_DRIVER', async () => {
  if (process.platform === 'darwin') {
    try {
      // Use system command to list audio devices
      return new Promise((resolve) => {
        exec('system_profiler SPAudioDataType', (error: any, stdout: string) => {
          if (error) {
            console.error('Error checking audio devices:', error);
            resolve(false);
          }
          // Check if BlackHole is in the output
          const hasBlackHole = stdout.toLowerCase().includes('blackhole');
          resolve(hasBlackHole);
        });
      });
    } catch (error) {
      console.error('Error checking BlackHole:', error);
      return false;
    }
  }
  return true; // Not macOS, so no need for BlackHole
});

// Add a new IPC handler to get the selected area
ipcMain.handle('GET_SELECTED_AREA', () => {
  console.log('Getting selected area:', selectedArea);
  return selectedArea;
});

ipcMain.handle('START_MOUSE_TRACKING', () => {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
  }
  
  mouseTrackingInterval = setInterval(() => {
    try {
      // Check if window exists and is not destroyed
      if (mainWindow && !mainWindow.isDestroyed()) {
        const position = screen.getCursorScreenPoint();
        mainWindow.webContents.send('MOUSE_POSITION', {
          x: position.x,
          y: position.y
        });
      } else {
        // Clear interval if window is gone
        if (mouseTrackingInterval) {
          clearInterval(mouseTrackingInterval);
          mouseTrackingInterval = null;
        }
      }
    } catch (error) {
      console.error('Error in mouse tracking:', error);
      // Clear interval on error
      if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval);
        mouseTrackingInterval = null;
      }
    }
  }, 1000 / 60); // 60fps updates
});

ipcMain.handle('STOP_MOUSE_TRACKING', () => {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
    mouseTrackingInterval = null;
  }
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
    mouseTrackingInterval = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up when app is quitting
app.on('before-quit', () => {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
    mouseTrackingInterval = null;
  }
}); 