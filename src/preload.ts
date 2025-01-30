// Add any preload scripts here
// window.addEventListener('DOMContentLoaded', () => {
//   console.log('DOM Content Loaded');
// });

import { contextBridge, ipcRenderer } from 'electron';

// Remove the old event listener
// window.addEventListener('DOMContentLoaded', () => {
//   console.log('DOM Content Loaded');
// });

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: async (channel: string, ...args: any[]) => {
      const validChannels = [
        'GET_ALL_SOURCES',
        'SAVE_VIDEO',
        'START_MOUSE_TRACKING',
        'STOP_MOUSE_TRACKING',
        'GET_SYSTEM_AUDIO_ACCESS',
        'CHECK_AUDIO_DRIVER',
        'START_AREA_SELECTION',
        'AREA_SELECTED',
        'CANCEL_SELECTION',
        'GET_SELECTED_AREA',
        'START_RECORDING',
        'STOP_RECORDING',
        'MOUSE_POSITION_UPDATE'
      ];
      
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
      if (channel === 'CONVERSION_PROGRESS') {
        ipcRenderer.on(channel, (_, ...args) => callback(...args));
      }
    }
  }
});

// Add mouse position event handler
ipcRenderer.on('MOUSE_POSITION', (_, position) => {
  window.dispatchEvent(new CustomEvent('mouse-position', { detail: position }));
}); 