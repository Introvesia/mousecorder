declare module 'ffprobe-static' {
  interface FfprobeStatic {
    path: string;
    version: string;
  }
  const ffprobe: FfprobeStatic;
  export default ffprobe;
} 