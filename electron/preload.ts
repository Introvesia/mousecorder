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
  'SAVE_VIDEO'
] as const

const validListenChannels = [
  'MOUSE_POSITION_UPDATE',
  'CONVERSION_PROGRESS'
] as const

type InvokeChannel = typeof validInvokeChannels[number]
type ListenChannel = typeof validListenChannels[number]

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    ipcRenderer: {
      invoke: (channel: InvokeChannel, ...args: any[]) => {
        if (validInvokeChannels.includes(channel)) {
          return ipcRenderer.invoke(channel, ...args)
        }
        throw new Error(`Invalid invoke channel: ${channel}`)
      },
      on: (channel: ListenChannel, callback: (...args: any[]) => void) => {
        if (validListenChannels.includes(channel)) {
          const subscription = (_: any, ...args: any[]) => callback(...args)
          ipcRenderer.on(channel, subscription)
          return () => {
            ipcRenderer.removeListener(channel, subscription)
          }
        }
        // Return a no-op cleanup function if channel is not valid
        return () => {}
      }
    }
  }
) 