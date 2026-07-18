import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { Alert, Box, CircularProgress, Typography } from '@suid/material';

const NEUTRAL_VIDEO_POSTER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221600%22 height=%22900%22 viewBox=%220 0 1600 900%22%3E%3Crect width=%221600%22 height=%22900%22 fill=%22%23101014%22/%3E%3C/svg%3E';

export function mediaUrlForPath(path) {
    const encodedPath = String(path || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment))
        .join('/');
    return `/media/${encodedPath}`;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'size unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'duration unknown';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - (minutes * 60);
    return minutes > 0 ? `${minutes}:${remainder.toFixed(1).padStart(4, '0')}` : `${remainder.toFixed(1)}s`;
}

function alphaEvidence(take) {
    const metadata = take?.generation_params?.provider_metadata;
    const candidates = [
        take?.alpha,
        take?.transparency,
        metadata?.alpha,
        metadata?.asset?.alpha,
        metadata?.inspection?.alpha,
        metadata?.postprocess?.alpha,
        metadata?.postprocessing?.alpha,
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (typeof candidate?.hasTransparentPixels === 'boolean') {
            return candidate.hasTransparentPixels;
        }
        if (typeof candidate?.has_transparent_pixels === 'boolean') {
            return candidate.has_transparent_pixels;
        }
        if (Number.isFinite(candidate?.transparentPixels)) {
            return candidate.transparentPixels > 0;
        }
        if (Number.isFinite(candidate?.transparent_pixels)) {
            return candidate.transparent_pixels > 0;
        }
    }
    return undefined;
}

function transparencyLabel(take) {
    const evidence = alphaEvidence(take);
    if (evidence === true) return 'Transparency: verified';
    if (evidence === false) return 'Transparency: verified opaque';

    const delivery = take?.generation_params?.provider_metadata?.delivery;
    const requested = delivery?.transparency === true
        || take?.generation_params?.full_settings?.transparency === true;
    return requested
        ? 'Transparency: requested, verification unknown'
        : 'Transparency: unknown';
}

function dimensionsLabel(take) {
    return take?.width && take?.height ? `${take.width} × ${take.height}` : 'dimensions unknown';
}

function aspectRatioLabel(take) {
    if (!take?.width || !take?.height) return 'aspect ratio unknown';
    return take.height > take.width ? '9:16 portrait' : '16:9 landscape';
}

export default function TakePreview(props) {
    const [loadState, setLoadState] = createSignal('loading');
    const source = createMemo(() => mediaUrlForPath(props.take?.path));
    const isImage = () => props.mediaType === 'image';
    const isVideo = () => props.mediaType === 'video';
    const isPortrait = () => (props.take?.height || 0) > (props.take?.width || 0);
    const technicalIssues = () => props.take?.technical_issues || [];

    createEffect(() => {
        source();
        setLoadState('loading');
    });

    const loadError = () => `Could not load preview for ${props.take?.filename || 'this take'}.`;

    return (
        <Box
            aria-label={`${isImage() ? 'Image' : 'Video'} preview for ${props.take?.filename || 'take'}`}
            sx={{
                width: '100%',
                maxHeight: '520px',
                overflow: 'auto',
                p: 1,
                mb: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.default',
            }}
        >
            <Show when={props.take?.technical_status === 'invalid'}>
                <Alert severity="error" aria-live="assertive" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Technically invalid candidate</Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        <For each={technicalIssues()}>
                            {(issue) => (
                                <li>
                                    <Typography variant="caption">
                                        {issue.message}
                                        {issue.expected ? ` Expected: ${issue.expected}.` : ''}
                                        {issue.actual ? ` Actual: ${issue.actual}.` : ''}
                                    </Typography>
                                </li>
                            )}
                        </For>
                    </Box>
                </Alert>
            </Show>
            <Box
                sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    minHeight: '180px',
                    maxHeight: '420px',
                    overflow: 'hidden',
                    borderRadius: 1,
                    bgcolor: '#101014',
                    ...(isImage() ? {
                        backgroundColor: '#d6d6d6',
                        backgroundImage: 'linear-gradient(45deg, #b8b8b8 25%, transparent 25%), linear-gradient(-45deg, #b8b8b8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #b8b8b8 75%), linear-gradient(-45deg, transparent 75%, #b8b8b8 75%)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                    } : {}),
                }}
                data-preview-background={isImage() ? 'checkerboard' : 'neutral-dark'}
            >
                <Show when={loadState() === 'loading'}>
                    <Box
                        aria-live="polite"
                        sx={{
                            position: 'absolute',
                            zIndex: 1,
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            color: isImage() ? '#202024' : 'common.white',
                        }}
                    >
                        <CircularProgress size={18} color="inherit" />
                        <Typography variant="caption" color="inherit">Loading preview…</Typography>
                    </Box>
                </Show>

                <Show when={isImage()}>
                    <img
                        src={source()}
                        alt={`Generated take: ${props.take?.filename || 'image'}`}
                        onLoad={() => setLoadState('loaded')}
                        onError={() => setLoadState('error')}
                        style={{
                            display: loadState() === 'error' ? 'none' : 'block',
                            'max-width': '100%',
                            'max-height': '400px',
                            width: 'auto',
                            height: 'auto',
                            'object-fit': 'contain',
                        }}
                    />
                </Show>

                <Show when={isVideo()}>
                    <video
                        src={source()}
                        controls
                        playsInline
                        preload="metadata"
                        poster={NEUTRAL_VIDEO_POSTER}
                        aria-label={`Video take: ${props.take?.filename || 'preview'}`}
                        onLoadedMetadata={() => setLoadState('loaded')}
                        onError={() => setLoadState('error')}
                        style={{
                            display: loadState() === 'error' ? 'none' : 'block',
                            'max-width': isPortrait() ? '260px' : '100%',
                            'max-height': '400px',
                            width: '100%',
                            'aspect-ratio': isPortrait() ? '9 / 16' : '16 / 9',
                            'object-fit': 'contain',
                            'background-color': '#101014',
                        }}
                    />
                </Show>
            </Box>

            <Show when={loadState() === 'error'}>
                <Alert severity="error" aria-live="assertive" sx={{ mt: 1 }}>
                    {loadError()}
                </Alert>
            </Show>

            <Box
                aria-label="Take technical details"
                sx={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', mt: 1 }}
            >
                <Typography variant="caption">{dimensionsLabel(props.take)}</Typography>
                <Typography variant="caption">{formatBytes(props.take?.size_bytes)}</Typography>
                <Typography variant="caption">{String(props.take?.format || 'format unknown').toUpperCase()}</Typography>
                <Show when={isImage()}>
                    <Typography variant="caption">{transparencyLabel(props.take)}</Typography>
                </Show>
                <Show when={isVideo()}>
                    <Typography variant="caption">{aspectRatioLabel(props.take)}</Typography>
                    <Typography variant="caption">{formatDuration(props.take?.duration_sec)}</Typography>
                    <Typography variant="caption">
                        {Number.isFinite(props.take?.fps) ? `${props.take.fps.toFixed(2).replace(/\.?0+$/, '')} fps` : 'fps unknown'}
                    </Typography>
                </Show>
            </Box>
        </Box>
    );
}
