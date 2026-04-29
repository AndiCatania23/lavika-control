import { Config } from '@remotion/cli/config';

/**
 * Remotion config for LAVIKA Social Manager.
 * Compositions vivono in src/video/compositions/, registrate via Root.tsx.
 */

Config.setEntryPoint('./src/video/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);

// Default codec for video output (h264 = compat IG/FB)
Config.setCodec('h264');

// Pixel format compatibile con tutti i player
Config.setPixelFormat('yuv420p');

// Concurrency: usa metà core CPU (Mac M4 Pro = 12 cores → 6 worker)
Config.setConcurrency(6);
