declare module 'fluent-ffmpeg' {
  export interface FfmpegCommand {
    input(input: string | Buffer): FfmpegCommand;
    inputFormat(format: string): FfmpegCommand;
    outputFormat(format: string): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    output(output: string): FfmpegCommand;
    on(event: 'start', callback: (commandLine: string) => void): FfmpegCommand;
    on(event: 'progress', callback: (progress: {
      frames: number;
      currentFps: number;
      currentKbps: number;
      targetSize: number;
      timemark: string;
      percent?: number;
    }) => void): FfmpegCommand;
    on(event: 'codecData', callback: (data: {
      format: string;
      duration: string;
      audio: string;
      video: string;
    }) => void): FfmpegCommand;
    on(event: 'end', callback: () => void): FfmpegCommand;
    on(event: 'error', callback: (err: Error) => void): FfmpegCommand;
    save(filename: string): FfmpegCommand;
  }

  const ffmpeg: {
    (options?: any): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
  };

  export default ffmpeg;
} 