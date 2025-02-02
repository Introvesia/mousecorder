import { MousePosition } from '@/types/index'
import { contextBridge, ipcRenderer } from 'electron'

// Whitelist of valid channels
const validInvokeChannels = [
  'GET_ALL_SOURCES',
  'CHECK_AUDIO_DRIVER',
  'START_MOUSE_TRACKING',
  'STOP_MOUSE_TRACKING',
  'START_RECORDING',
  'STOP_RECORDING',
  'GET_SELECTED_AREA',
  'SAVE_VIDEO',
  'START_AREA_SELECTION',
  'AREA_SELECTED',
  'CANCEL_SELECTION',
  'GET_SYSTEM_AUDIO_ACCESS',
  'MOUSE_POSITION_UPDATE'
] as const

const validListenChannels = [
  'MOUSE_POSITION_UPDATE',
  'CONVERSION_PROGRESS',
  'MOUSE_POSITION'
] as const

type InvokeChannel = typeof validInvokeChannels[number]
type ListenChannel = typeof validListenChannels[number]

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
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
        if (channel === 'MOUSE_POSITION_UPDATE' || channel === 'CONVERSION_PROGRESS') {
          const subscription = (_: any, ...args: any[]) => callback(...args);
          ipcRenderer.on(channel, subscription);
          // Return unsubscribe function
          return () => {
            ipcRenderer.removeListener(channel, subscription);
          };
        }
        // Return no-op function for invalid channels
        return () => {};
      },
      onMousePosition: (callback: (position: MousePosition) => void): (() => void) => {
        const subscription = (_: any, position: any) => {
          window.dispatchEvent(new CustomEvent('mouse-position', { 
            detail: position 
          }));
          callback(position);
        };
        ipcRenderer.on('MOUSE_POSITION_UPDATE', subscription);
        return () => {
          ipcRenderer.removeListener('MOUSE_POSITION_UPDATE', subscription);
        };
      }
    }
  }
) 