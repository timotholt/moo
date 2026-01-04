import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { Box, Typography, IconButton } from '@suid/material';
import PlayArrowIcon from '@suid/icons-material/PlayArrow';
import PauseIcon from '@suid/icons-material/Pause';
import StopIcon from '@suid/icons-material/Stop';
import VolumeUpIcon from '@suid/icons-material/VolumeUp';
import VolumeOffIcon from '@suid/icons-material/VolumeOff';
import CloseIcon from '@suid/icons-material/Close';
import WaveSurfer from 'wavesurfer.js';
import Slider from './Slider.jsx';

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayerBar(props) {
    // props: currentTake, audioUrl, isPlaying, onPlayingChange

    let containerRef;
    let wavesurfer = null;

    const [duration, setDuration] = createSignal(0);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [volume, setVolume] = createSignal(1);
    const [isMuted, setIsMuted] = createSignal(false);
    const [isReady, setIsReady] = createSignal(false);

    // Track previous audioUrl to detect changes manually if needed, 
    // but createEffect on props.audioUrl should handle it.

    const initWaveSurfer = (url) => {
        if (!containerRef || !url) return;

        // Cleanup existing
        if (wavesurfer) {
            wavesurfer.destroy();
        }

        containerRef.innerHTML = '';

        wavesurfer = WaveSurfer.create({
            container: containerRef,
            waveColor: '#666',
            progressColor: '#1976d2',
            cursorColor: '#1976d2',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 32,
            normalize: true,
        });

        wavesurfer.load(url);

        wavesurfer.on('ready', () => {
            setDuration(wavesurfer.getDuration());
            setIsReady(true);
            // Auto-play when loaded
            wavesurfer.play();
            if (props.onPlayingChange) props.onPlayingChange(true);
        });

        wavesurfer.on('audioprocess', () => {
            setCurrentTime(wavesurfer.getCurrentTime());
        });

        wavesurfer.on('seeking', () => {
            setCurrentTime(wavesurfer.getCurrentTime());
        });

        wavesurfer.on('play', () => {
            if (props.onPlayingChange) props.onPlayingChange(true);
        });

        wavesurfer.on('pause', () => {
            if (props.onPlayingChange) props.onPlayingChange(false);
        });

        wavesurfer.on('finish', () => {
            if (props.onPlayingChange) props.onPlayingChange(false);
        });

        wavesurfer.on('error', (err) => {
            console.error('[AudioPlayerBar] WaveSurfer error:', err);
            setIsReady(false);
        });

        wavesurfer.setVolume(isMuted() ? 0 : volume());
    };

    createEffect(() => {
        const url = props.audioUrl;
        setIsReady(false);
        setDuration(0);
        setCurrentTime(0);

        if (url) {
            initWaveSurfer(url);
        } else {
            if (wavesurfer) {
                wavesurfer.destroy();
                wavesurfer = null;
            }
        }
    });

    // Sync playback state with parent's isPlaying prop
    createEffect(() => {
        const playing = props.isPlaying;
        if (!wavesurfer || !isReady()) return;

        const wsIsPlaying = wavesurfer.isPlaying();
        if (playing && !wsIsPlaying) {
            wavesurfer.play();
        } else if (!playing && wsIsPlaying) {
            wavesurfer.pause();
        }
    });

    // Handle volume changes
    createEffect(() => {
        if (wavesurfer) {
            wavesurfer.setVolume(isMuted() ? 0 : volume());
        }
    });

    onCleanup(() => {
        if (wavesurfer) {
            wavesurfer.destroy();
            wavesurfer = null;
        }
    });

    const handlePlayPause = () => {
        if (wavesurfer) {
            wavesurfer.playPause();
        }
    };

    const handleStop = () => {
        if (wavesurfer) {
            wavesurfer.stop();
            setCurrentTime(0);
            if (props.onPlayingChange) props.onPlayingChange(false);
        }
    };

    const handleVolumeChange = (e, newValue) => {
        setVolume(newValue);
        setIsMuted(newValue === 0);
    };

    const handleMuteToggle = () => {
        setIsMuted(!isMuted());
    };

    const getStatusBgColor = () => {
        if (!props.currentTake) return 'background.paper';
        switch (props.currentTake.status) {
            case 'approved':
                return 'success.dark';
            case 'rejected':
                return 'error.dark';
            default:
                return 'background.paper';
        }
    };

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                px: 1,
                py: 0.5,
                zIndex: 1300,
                boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                width: '100%',
                flexShrink: 0,
            }}
        >
            {/* Top row: Waveform */}
            <Box
                sx={{
                    width: '100%',
                    height: 32,
                    position: 'relative',
                }}
            >
                <div
                    ref={containerRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        cursor: props.audioUrl ? 'pointer' : 'default',
                        display: props.audioUrl ? 'block' : 'none',
                    }}
                />
                {!props.audioUrl && (
                    <Box
                        sx={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                        }}
                    >
                        <Typography variant="caption" color="text.disabled">
                            Select a take to play
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Bottom row: Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <IconButton onClick={handlePlayPause} size="small" color="primary" disabled={!props.audioUrl} sx={{ p: 0.5 }}>
                    {props.isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                </IconButton>
                <IconButton onClick={handleStop} size="small" disabled={!props.audioUrl} sx={{ p: 0.5 }}>
                    <StopIcon fontSize="small" />
                </IconButton>

                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: props.audioUrl ? 'text.primary' : 'text.disabled' }}>
                    {formatTime(currentTime())} / {formatTime(duration())}
                </Typography>

                <Box sx={{ flexGrow: 1 }} />

                <Box
                    sx={{
                        overflow: 'hidden',
                        bgcolor: getStatusBgColor(),
                        px: 1,
                        py: 0.25,
                        borderRadius: 0.5,
                        transition: 'background-color 0.3s ease',
                        maxWidth: { xs: 120, sm: 200 },
                    }}
                >
                    <Typography
                        variant="caption"
                        noWrap
                        sx={{ fontWeight: 500, fontSize: '0.7rem', display: 'block' }}
                        title={props.currentTake?.filename || ''}
                    >
                        {props.currentTake?.filename || 'No track'}
                    </Typography>
                </Box>

                <IconButton onClick={handleMuteToggle} size="small" disabled={!props.audioUrl} sx={{ p: 0.5 }}>
                    {isMuted() || volume() === 0 ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                </IconButton>
                <Box sx={{ width: 60, display: 'flex', alignItems: 'center' }}>
                    <Slider
                        value={isMuted() ? 0 : volume()}
                        onChange={handleVolumeChange}
                        min={0}
                        max={1}
                        step={0.01}
                        size="small"
                        disabled={!props.audioUrl}
                    />
                </Box>
                <IconButton onClick={props.onClose} size="small" sx={{ p: 0.5, ml: 0.5 }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>
        </Box>
    );
}
