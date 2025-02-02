// import { IpcRendererEvent } from 'electron'

export interface MousePosition {
  x: number
  y: number
  timestamp: number
}

export interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, callback: (data: MousePosition) => void): () => void;
  };
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoSettings {
  sourceId: string;
  includeAudio: boolean;
  format: string;
  quality: string;
  fps: number;
  areaSelection: Area | null;
}

// Add CustomMediaStream interface
export interface CustomMediaStream extends MediaStream {
  updatePosition?: (x: number, y: number) => void;
}

declare global {
  interface Window {
    electron: IElectronAPI
  }

  interface MediaTrackConstraintSet {
    chromeMediaSource?: string;
    chromeMediaSourceId?: string;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  }

  interface DesktopCapturerSource {
    id: string;
    name: string;
    thumbnail: Electron.NativeImage;
    display_id?: string;
  }
} 