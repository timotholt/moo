import { hasCommand } from '../services/generation-preflight.js';

const [ffprobe, ffmpeg] = await Promise.all([hasCommand('ffprobe'), hasCommand('ffmpeg')]);

if (ffprobe) console.log('✓ ffprobe available');
else console.error('× ffprobe missing — required to read generated audio metadata. Install ffmpeg.');

if (ffmpeg) console.log('✓ ffmpeg available');
else console.error('× ffmpeg missing — required to embed portable metadata in generated audio. Install ffmpeg.');

if (!ffprobe || !ffmpeg) process.exitCode = 1;
