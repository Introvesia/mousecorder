import { NativeImage } from 'electron'

export interface MousePosition {
  x: number
  y: number
  timestamp: number
}

export interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, callback: (...args: any[]) => void): (() => void);
    removeListener?(channel: string, callback: (...args: any[]) => void): void;
    onMousePosition: (callback: (position: MousePosition) => void) => void;
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

export interface CustomMediaStream extends MediaStream {
  updatePosition?: (x: number, y: number) => void;
}

export interface DesktopCapturerSource {
  id: string;
  name: string;
  thumbnail: NativeImage;
  display_id?: string;
}

export interface MediaTrackConstraintSet extends MediaTrackConstraints {
  chromeMediaSource?: string;
  chromeMediaSourceId?: string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface DesktopCaptureMediaTrackConstraints {
  mandatory: {
    chromeMediaSource: 'desktop';
    chromeMediaSourceId: string;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
}

export interface CustomMediaStreamConstraints {
  audio: boolean | DesktopCaptureMediaTrackConstraints;
  video: DesktopCaptureMediaTrackConstraints;
}

// Remove the MediaStreamConstraints declaration from global
declare global {
  interface MediaTrackConstraints {
    mandatory?: {
      chromeMediaSource?: string;
      chromeMediaSourceId?: string;
    };
  }
} 