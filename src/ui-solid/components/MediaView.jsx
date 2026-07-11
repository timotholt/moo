import { createSignal, createEffect, createMemo, Show, For, onCleanup } from 'solid-js';
import {
    Box, Typography, IconButton, Dialog, DialogTitle, DialogContent, Alert,
    DialogActions, Button, List, ListItem, ListItemIcon, ListItemText,
    CircularProgress, Paper
} from '@suid/material';
import TextInput from './TextInput.jsx';
import Tooltip from './Tooltip.jsx';
import Collapse from './Collapse.jsx';
import DeleteIcon from '@suid/icons-material/Delete';
import PlayArrowIcon from '@suid/icons-material/PlayArrow';
import StopIcon from '@suid/icons-material/Stop';
import ThumbUpIcon from '@suid/icons-material/ThumbUp';
import ThumbDownIcon from '@suid/icons-material/ThumbDown';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import ExpandLessIcon from '@suid/icons-material/ExpandLess';
import RefreshIcon from '@suid/icons-material/Refresh';
import AutoAwesomeIcon from '@suid/icons-material/AutoAwesome';
import AutoFixHighIcon from '@suid/icons-material/AutoFixHigh';
import RestartAltIcon from '@suid/icons-material/RestartAlt';
import { deleteMedia, updateMedia, updateTake, generateTakes, deleteTake, selectMediaTakes, getGenerationPreflight } from '../api/client.js';
import DetailHeader from './DetailHeader.jsx';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { buildMediaPath } from '../utils/pathBuilder.js';
import { useLog, usePlayback, useStatus, useCredits } from '../contexts/AppContext.jsx';
import ProviderSettingsEditor from './ProviderSettingsEditor.jsx';
import { getInheritedSettings } from '../utils/inheritance.js';

// Helper to format date
function formatStatusDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${month}/${day} @ ${hours}:${minutes}${ampm}`;
}

export default function MediaView(props) {
    // props: item, owner, bin, bins, allTakes, onMediaDeleted, onMediaUpdated, onBinUpdated, onActorUpdated, 
    //        binComplete, blankSpaceConversion, capitalizationConversion, onTakesGenerated, onTakeUpdated, 
    //        projectDefaults, operations, error

    const baseLog = useLog();
    const playback = usePlayback();
    const status = useStatus();
    const credits = useCredits();

    const [confirmDeleteMediaOpen, setConfirmDeleteMediaOpen] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    const [localError, setLocalError] = createSignal(null);

    // Editable fields
    const [name, setName] = createSignal(props.item.name || '');
    const [prompt, setPrompt] = createSignal(props.item.prompt || '');
    const [saving, setSaving] = createSignal(false);
    const [settingsExpanded, setSettingsExpanded] = createSignal(false);

    // AI State
    const [aiLoading, setAiLoading] = createSignal(false);
    const [aiError, setAiError] = createSignal('');

    // Local takes state
    const filteredTakes = createMemo(() =>
        (props.allTakes || []).filter(t => t.media_id === props.item.id)
    );

    const [optimisticTakes, setOptimisticTakes] = createSignal([]);

    // Merged takes list
    const takes = createMemo(() => {
        const parentTakes = filteredTakes();
        const parentIds = new Set(parentTakes.map(t => t.id));
        const neededOptimistic = optimisticTakes().filter(t => !parentIds.has(t.id));
        return [...parentTakes, ...neededOptimistic];
    });

    const [generatingTakes, setGeneratingTakes] = createSignal(false);
    const [preflight, setPreflight] = createSignal(null);
    const [checkingPreflight, setCheckingPreflight] = createSignal(false);
    const [expandedTakeId, setExpandedTakeId] = createSignal(null);
    const [editingName, setEditingName] = createSignal(false);

    // Completion is derived from approved takes; it is not a manual lock.
    const isDisabled = () => false;

    // Resolve inherited settings for this media item
    const inheritedSettings = createMemo(() => {
        return getInheritedSettings(props.item.media_type, {
            bin: props.bin,
            owner: props.owner,
            projectDefaults: props.projectDefaults
        });
    });

    const currentBlock = () => props.item.default_blocks?.[props.item.media_type] || { provider: 'inherit' };

    const effectiveSettings = createMemo(() => {
        const block = currentBlock();
        if (block.provider === 'inherit') return inheritedSettings();
        return block;
    });

    // Sync state when item changes
    createEffect(() => {
        const item = props.item;
        setName(item.name || '');
        setPrompt(item.prompt || '');
        setOptimisticTakes([]);
        setLocalError(null);
    });

    const handleConfirmDeleteMedia = async () => {
        try {
            setDeleting(true);
            setLocalError(null);
            if (status.onStatusChange) status.onStatusChange('Processing');
            await deleteMedia(props.item.id);
            if (props.onMediaDeleted) props.onMediaDeleted(props.item.id);
            setConfirmDeleteMediaOpen(false);
        } catch (err) {
            setLocalError(err.message || String(err));
        } finally {
            setDeleting(false);
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    const handleSaveField = async (field, value) => {
        try {
            setSaving(true);
            setLocalError(null);
            if (status.onStatusChange) status.onStatusChange('Processing');

            const oldName = field === 'name' ? props.item.name : null;
            const result = await updateMedia(props.item.id, { [field]: value });

            if (result.media && props.onMediaUpdated) {
                props.onMediaUpdated(result.media, oldName);
            }
        } catch (err) {
            setLocalError(err.message || String(err));
        } finally {
            setSaving(false);
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    const handlePlayTake = (take) => {
        if (playback.onTakePlayed) playback.onTakePlayed(take.id);

        if (playback.playingTakeId === take.id) {
            if (playback.onStopRequest) playback.onStopRequest();
        } else {
            if (playback.onPlayRequest) playback.onPlayRequest(props.item.id, take);
        }
    };

    const handleTakeStatus = async (takeId, newStatus) => {
        try {
            if (status.onStatusChange) status.onStatusChange('Processing');
            const take = takes().find(t => t.id === takeId);
            const previousStatus = take?.status || 'new';

            const result = await updateTake(takeId, { status: newStatus });

            if (result.take) {
                setOptimisticTakes(prev => {
                    const existing = prev.find(t => t.id === takeId);
                    if (existing) return prev.map(t => t.id === takeId ? result.take : t);
                    return prev;
                });

                if (props.onTakeUpdated) props.onTakeUpdated(result.take);
                if (result.media && props.onMediaUpdated) props.onMediaUpdated(result.media);

                // Log
                const path = buildMediaPath(
                    props.item.owner_type,
                    props.item.owner_id,
                    props.item.bin_id,
                    props.item.name,
                    { actors: props.actors, scenes: props.scenes, bins: props.bins }
                );
                const filenameStr = result.take.filename || takeId;

                if (newStatus === 'approved') baseLog.logInfo(`user approved ${path} → ${filenameStr}`);
                else if (newStatus === 'rejected') baseLog.logInfo(`user rejected ${path} → ${filenameStr}`);
                else if (newStatus === 'new' && previousStatus === 'approved') baseLog.logInfo(`user unapproved ${path} → ${filenameStr}`);
                else if (newStatus === 'new' && previousStatus === 'rejected') baseLog.logInfo(`user unrejected ${path} → ${filenameStr}`);
            }
        } catch (err) {
            setLocalError(err.message);
            baseLog.logError(`Failed to update take status: ${err.message}`);
        } finally {
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    const handleSaveReviewNote = async (take, reviewNote) => {
        if (reviewNote === (take.review_note || '')) return;
        try {
            setSaving(true);
            const result = await updateTake(take.id, { review_note: reviewNote });
            if (result.take) {
                setOptimisticTakes(prev => prev.map(item => item.id === take.id ? result.take : item));
                if (props.onTakeUpdated) props.onTakeUpdated(result.take);
            }
        } catch (err) {
            setLocalError(err.message || String(err));
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateTakesCount = async (count) => {
        if (props.binComplete || generatingTakes() || count <= 0) return;
        try {
            setGeneratingTakes(true);
            setLocalError(null);
            if (status.onStatusChange) status.onStatusChange(`Generating ${count} take${count > 1 ? 's' : ''}...`);

            const result = await generateTakes(props.item.id, count);
            if (result.takes && result.takes.length > 0) {
                setOptimisticTakes(prev => [...prev, ...result.takes]);
                if (props.onTakesGenerated) props.onTakesGenerated(result.takes);
            }
        } catch (err) {
            const errorMsg = err.message || String(err);
            setLocalError(errorMsg);
            baseLog.logError(`Generation failed: ${errorMsg}`);
        } finally {
            setGeneratingTakes(false);
            if (status.onStatusChange) status.onStatusChange('');
            if (credits.onCreditsRefresh) setTimeout(() => credits.onCreditsRefresh(), 1000);
        }
    };

    const checkGenerationReadiness = async () => {
        try {
            setCheckingPreflight(true);
            setPreflight(await getGenerationPreflight(props.item.id));
        } catch (err) {
            setPreflight({ ready: false, checks: [{ id: 'request', status: 'blocked', message: err.message || String(err) }] });
        } finally {
            setCheckingPreflight(false);
        }
    };

    const handleDeleteTake = async (takeId) => {
        try {
            if (status.onStatusChange) status.onStatusChange('Processing');
            const take = takes().find(t => t.id === takeId);
            const result = await deleteTake(takeId);
            setOptimisticTakes(prev => prev.filter(t => t.id !== takeId));
            baseLog.logInfo(result.audioRetained
                ? `Take removed from catalog; audio retained: ${take?.filename || takeId}`
                : `Take deleted: ${take?.filename || takeId}`);
        } catch (err) {
            setLocalError(err.message);
            baseLog.logError(`Failed to delete take: ${err.message}`);
        } finally {
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    const handleAIGenerate = async () => {
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch('/api/llm/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaName: props.item.name || 'untitled',
                    ownerName: props.owner ? (props.owner.display_name || props.owner.name) : 'Global',
                    mediaType: props.item.media_type
                })
            });
            const data = await res.json();
            if (res.ok && data.prompt) {
                setPrompt(data.prompt);
                handleSaveField('prompt', data.prompt);
            } else {
                setAiError(data.error || 'Failed');
            }
        } catch (err) { setAiError(err.message); }
        finally { setAiLoading(false); }
    };

    const handleAIImprove = async () => {
        if (!prompt().trim()) return setAiError('Enter prompt first');
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch('/api/llm/improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPrompt: prompt(),
                    mediaName: props.item.name || 'untitled',
                    mediaType: props.item.media_type
                })
            });
            const data = await res.json();
            if (res.ok && data.prompt) {
                setPrompt(data.prompt);
                handleSaveField('prompt', data.prompt);
            } else {
                setAiError(data.error || 'Failed');
            }
        } catch (err) { setAiError(err.message); }
        finally { setAiLoading(false); }
    };

    const handleResetPrompt = () => {
        setPrompt('');
        handleSaveField('prompt', '');
        setAiError('');
    };

    const approvedCount = () => takes().filter(t => t.status === 'approved').length;
    const isSelectedTake = (takeId) => (props.item.selected_take_ids || []).includes(takeId);
    const toggleSelectedTake = async (take) => {
        if (take.status !== 'approved') return;
        const next = isSelectedTake(take.id)
            ? (props.item.selected_take_ids || []).filter((id) => id !== take.id)
            : [...(props.item.selected_take_ids || []), take.id];
        try {
            setSaving(true);
            const result = await selectMediaTakes(props.item.id, next);
            if (props.onMediaUpdated) props.onMediaUpdated(result.media);
        } catch (err) {
            setLocalError(err.message);
        } finally {
            setSaving(false);
        }
    };
    const requiredApprovals = () => {
        return effectiveSettings().approval_count_default || 1;
    };
    const subtitle = () => `${props.item.owner_type}: ${props.owner ? (props.owner.display_name || props.owner.name) : 'Global'} • type: ${props.item.media_type}`;

    const handleSaveName = () => {
        if (name() !== props.item.name) {
            handleSaveField('name', name());
        }
        setEditingName(false);
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Show when={editingName()} fallback={
                <DetailHeader
                    title={props.item.name || 'untitled'}
                    subtitle={subtitle()}
                    onEdit={() => {
                        setEditingName(true);
                        setName(props.item.name || '');
                    }}
                    onDelete={() => setConfirmDeleteMediaOpen(true)}
                    editDisabled={isDisabled()}
                    deleteDisabled={isDisabled()}
                    rightActions={
                        <Button
                            variant={(props.item.completion_override || approvedCount() >= requiredApprovals()) ? 'contained' : 'outlined'}
                            size="small"
                            color="success"
                            disabled={saving() || approvedCount() === 0}
                            onClick={async () => {
                                setSaving(true);
                                try {
                                    const result = await updateMedia(props.item.id, { completion_override: !props.item.completion_override });
                                    if (result.media && props.onMediaUpdated) props.onMediaUpdated(result.media);
                                } catch (err) {
                                    setLocalError(err.message);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {(props.item.completion_override || approvedCount() >= requiredApprovals())
                                ? 'complete ✓'
                                : `finish early (${approvedCount()}/${requiredApprovals()})`}
                        </Button>
                    }
                />
            }>
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextInput
                        size="small"
                        value={name()}
                        onValueChange={setName}
                        placeholder={props.item.name}
                        autoFocus
                        sx={{ flexGrow: 1 }}
                    />
                    <Button variant="contained" onClick={handleSaveName}>Save</Button>
                    <Button onClick={() => setEditingName(false)}>Cancel</Button>
                </Box>
            </Show>

            {/* Prompt Editor */}
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5, gap: 0.5 }}>
                    <Show when={aiLoading()}><CircularProgress size={16} /></Show>
                    <IconButton size="small" onClick={handleAIGenerate} disabled={isDisabled() || aiLoading()}>
                        <AutoAwesomeIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={handleAIImprove} disabled={isDisabled() || aiLoading() || !prompt()}>
                        <AutoFixHighIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={handleResetPrompt} disabled={isDisabled()}>
                        <RestartAltIcon fontSize="small" />
                    </IconButton>
                </Box>
                <TextInput
                    fullWidth
                    size="small"
                    label="Prompt"
                    multiline
                    rows={3}
                    value={prompt()}
                    onValueChange={setPrompt}
                    onBlur={() => prompt() !== props.item.prompt && handleSaveField('prompt', prompt())}
                    disabled={isDisabled() || saving()}
                />
                <Show when={aiError()}>
                    <Typography variant="caption" color="error">{aiError()}</Typography>
                </Show>
            </Box>

            {/* Provider Settings Override */}
            <Box sx={{ mt: 2 }}>
                <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: 'background.paper', borderRadius: '8px' }}>
                    <Box
                        sx={{
                            p: 1.5,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            bgcolor: 'action.hover'
                        }}
                        onClick={() => setSettingsExpanded(!settingsExpanded())}
                    >
                        <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 700 }}>LOCAL SETTINGS OVERRIDES</Typography>
                        {settingsExpanded() ? <ExpandLessIcon sx={{ fontSize: '1.2rem' }} /> : <ExpandMoreIcon sx={{ fontSize: '1.2rem' }} />}
                    </Box>
                    <Collapse in={settingsExpanded()}>
                        <Box sx={{ p: 2 }}>
                            <ProviderSettingsEditor
                                mediaType={props.item.media_type}
                                settings={currentBlock()}
                                inheritedSettings={inheritedSettings()}
                                voices={props.operations?.voices?.() || []}
                                loadingVoices={props.operations?.loadingVoices?.() || false}
                                allowInherit={true}
                                onSettingsChange={(settings) => {
                                    const currentBlocks = props.item.default_blocks || {};
                                    handleSaveField('default_blocks', {
                                        ...currentBlocks,
                                        [props.item.media_type]: settings
                                    });
                                }}
                                error={localError()}
                            />
                        </Box>
                    </Collapse>
                </Paper>
            </Box>

            <Show when={localError() || props.error}>
                <Typography color="error">{localError() || props.error}</Typography>
            </Show>

            {/* Generated Takes List */}
            <Box sx={{ mt: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block' }}>
                    {approvedCount()} of {requiredApprovals()} approved takes to be complete
                </Typography>

                <List dense disablePadding sx={{ mt: 1 }}>
                    <For each={takes()}>
                        {(take) => (
                            <Box sx={{ mb: 0.5 }}>
                                <ListItem
                                    sx={{
                                        py: 0.25, px: 0.5, borderRadius: 1,
                                        bgcolor: take.status === 'approved' ? 'success.dark' :
                                            take.status === 'rejected' ? 'error.light' : 'action.hover',
                                        opacity: take.status === 'rejected' ? 0.6 : 1
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                        <IconButton size="small" onClick={() => handlePlayTake(take)} sx={{ p: 0.25 }}>
                                            <Show when={playback.playingTakeId === take.id} fallback={<PlayArrowIcon sx={{ fontSize: '1rem' }} />}>
                                                <StopIcon sx={{ fontSize: '1rem' }} />
                                            </Show>
                                        </IconButton>
                                    </ListItemIcon>
                                    <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => handlePlayTake(take)}>
                                        <ListItemText
                                            primary={`${take.filename || `take_${take.take_number}`}${take.status === 'new' && !playback.playedTakes[take.id] ? ' (new)' : ''}`}
                                            secondary={
                                                take.status === 'approved' && take.status_changed_at
                                                    ? `${take.duration_sec?.toFixed(1) || '?'}s • approved ${formatStatusDate(take.status_changed_at)}`
                                                    : take.status === 'rejected' && take.status_changed_at
                                                        ? `${take.duration_sec?.toFixed(1) || '?'}s • rejected ${formatStatusDate(take.status_changed_at)}`
                                                        : `${take.duration_sec?.toFixed(1) || '?'}s • generated ${formatStatusDate(take.created_at)}`
                                            }
                                            primaryTypographyProps={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'common.white' }}
                                            secondaryTypographyProps={{ fontSize: '0.65rem' }}
                                            sx={{ my: 0 }}
                                        />
                                    </Box>
                                    <IconButton
                                        size="small"
                                        onClick={() => toggleSelectedTake(take)}
                                        disabled={take.status !== 'approved' || saving()}
                                        title={isSelectedTake(take.id) ? 'Remove selected deliverable' : 'Select as deliverable'}
                                        sx={{ p: 0.25, color: isSelectedTake(take.id) ? 'warning.main' : 'text.disabled' }}
                                    >
                                        <span style={{ 'font-size': '0.8rem' }}>★</span>
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleTakeStatus(take.id, take.status === 'approved' ? 'new' : 'approved')}
                                        disabled={isDisabled()}
                                        sx={{
                                            p: 0.25,
                                            color: take.status === 'approved' ? 'common.white' : 'text.disabled',
                                        }}
                                    >
                                        <ThumbUpIcon sx={{ fontSize: '0.875rem' }} />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleTakeStatus(take.id, take.status === 'rejected' ? 'new' : 'rejected')}
                                        disabled={isDisabled()}
                                        sx={{
                                            p: 0.25,
                                            color: take.status === 'rejected' ? 'common.white' : 'text.disabled',
                                        }}
                                    >
                                        <ThumbDownIcon sx={{ fontSize: '0.875rem' }} />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDeleteTake(take.id)}
                                        disabled={isDisabled()}
                                        title="Remove take from catalog; keep its audio file"
                                        sx={{
                                            p: 0.25,
                                            ml: '0.5rem',
                                            color: 'text.disabled',
                                            '&:hover': { color: 'error.main' }
                                        }}
                                    >
                                        <DeleteIcon sx={{ fontSize: '0.875rem' }} />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        onClick={() => setExpandedTakeId(expandedTakeId() === take.id ? null : take.id)}
                                        sx={{ p: 0.25, ml: '0.5rem' }}
                                    >
                                        <Show when={expandedTakeId() === take.id} fallback={<ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />}>
                                            <ExpandLessIcon sx={{ fontSize: '0.875rem' }} />
                                        </Show>
                                    </IconButton>
                                </ListItem>

                                <Collapse in={expandedTakeId() === take.id}>
                                    <Box sx={{
                                        px: 1, py: 0.5, ml: 3.5,
                                        bgcolor: 'action.hover',
                                        borderRadius: 1,
                                        fontSize: '0.65rem',
                                        fontFamily: 'monospace',
                                        color: 'text.secondary'
                                    }}>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                            <strong>Provider:</strong> {take.generation_params?.provider || take.generated_by || 'unknown'}
                                        </Typography>
                                        <Show when={take.generation_params?.voice_id}>
                                            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                                <strong>Voice ID:</strong> {take.generation_params.voice_id}
                                            </Typography>
                                        </Show>
                                        <Show when={take.generation_params?.stability !== undefined}>
                                            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                                <strong>Stability:</strong> {take.generation_params.stability}
                                            </Typography>
                                        </Show>
                                        <Show when={take.generation_params?.similarity_boost !== undefined}>
                                            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                                <strong>Similarity:</strong> {take.generation_params.similarity_boost}
                                            </Typography>
                                        </Show>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                            <strong>Prompt:</strong> {take.generation_params?.prompt || props.item.prompt || props.item.name || 'unknown'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                            <strong>Generated:</strong> {formatStatusDate(take.generation_params?.generated_at || take.created_at)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                                            <strong>Format:</strong> {take.format} • {take.sample_rate}Hz • {take.bit_depth}bit • {take.channels}ch
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>
                                            <strong>Hash:</strong> {take.hash_sha256 || 'unknown'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block', mt: 0.75 }}>
                                            <strong>Reviewed:</strong> {take.reviewed_at ? formatStatusDate(take.reviewed_at) : 'not yet'}
                                        </Typography>
                                        <TextInput
                                            fullWidth
                                            size="small"
                                            label="Review note"
                                            defaultValue={take.review_note || ''}
                                            onBlur={(event) => handleSaveReviewNote(take, event.currentTarget.value)}
                                            sx={{ mt: 1, '& .MuiInputBase-input': { fontSize: '0.75rem' } }}
                                        />
                                    </Box>
                                </Collapse>
                            </Box>
                        )}
                    </For>
                </List>

                {/* Generate Takes Buttons */}
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    {(() => {
                        const settings = effectiveSettings();
                        const voiceMissing = props.item.media_type === 'dialogue' && (!settings || !settings.voice_id);
                        const disabled = () => generatingTakes() || voiceMissing || approvedCount() >= requiredApprovals();

                        // Calculate counts
                        const undecidedCount = takes().filter(t => t.status === 'new').length;
                        const approvedCountVal = approvedCount();
                        const minCandidates = settings.min_candidates || 1;
                        const minApprovedTakes = settings.approval_count_default || 1;

                        const isComplete = props.item.completion_override || approvedCountVal >= minApprovedTakes;
                        const hasEnoughApproved = approvedCountVal >= minApprovedTakes;
                        const needed = (isComplete || hasEnoughApproved) ? 0 : Math.max(0, minCandidates - undecidedCount);

                        const generate1Button = (
                            <Button
                                variant="outlined"
                                size="small"
                                disabled={disabled()}
                                onClick={() => handleGenerateTakesCount(1)}
                                sx={{ ...DESIGN_SYSTEM.typography.small, flex: 1 }}
                            >
                                {generatingTakes() ? 'Generating...' : 'Generate 1 Take'}
                            </Button>
                        );

                        let backfillButton;
                        if (isComplete) {
                            backfillButton = (
                                <Button variant="outlined" size="small" disabled sx={{ ...DESIGN_SYSTEM.typography.small, flex: 1, opacity: 0.5 }}>
                                    Complete
                                </Button>
                            );
                        } else if (hasEnoughApproved) {
                            backfillButton = (
                                <Button variant="outlined" size="small" disabled sx={{ ...DESIGN_SYSTEM.typography.small, flex: 1, opacity: 0.5 }}>
                                    Approved ({approvedCountVal}/{minApprovedTakes})
                                </Button>
                            );
                        } else if (needed > 0) {
                            backfillButton = (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    disabled={disabled()}
                                    onClick={() => handleGenerateTakesCount(needed)}
                                    sx={{ ...DESIGN_SYSTEM.typography.small, flex: 1 }}
                                >
                                    {generatingTakes() ? 'Generating...' : `Backfill ${needed} Take${needed > 1 ? 's' : ''}`}
                                </Button>
                            );
                        } else {
                            backfillButton = (
                                <Button variant="outlined" size="small" disabled sx={{ ...DESIGN_SYSTEM.typography.small, flex: 1, opacity: 0.5 }}>
                                    Candidates Met ({undecidedCount}/{minCandidates})
                                </Button>
                            );
                        }

                        if (voiceMissing) {
                            return (
                                <Tooltip title="Select a default dialogue voice in Provider settings before generating takes.">
                                    <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                                        <Box sx={{ flex: 1 }}>{generate1Button}</Box>
                                        <Box sx={{ flex: 1 }}>{backfillButton}</Box>
                                    </Box>
                                </Tooltip>
                            );
                        }

                        return (
                            <>
                                {generate1Button}
                                {backfillButton}
                            </>
                        );
                    })()}
                </Box>
                <Box sx={{ mt: 1 }}>
                    <Button size="small" variant="text" onClick={checkGenerationReadiness} disabled={checkingPreflight()}>
                        {checkingPreflight() ? 'Checking readiness…' : 'Check generation readiness'}
                    </Button>
                    <Show when={preflight()}>{(result) => <Alert severity={result().ready ? 'success' : 'warning'} sx={{ mt: 0.5, py: 0 }}>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                            Next spend: {result().estimate.provider_requests} request{result().estimate.provider_requests === 1 ? '' : 's'}
                            {result().estimate.estimated_characters !== null ? ` · about ${result().estimate.estimated_characters} characters` : ''}
                        </Typography>
                        <Show when={result().estimate.quota_remaining_characters !== null}>
                            <Typography variant="caption" sx={{ display: 'block' }}>Remaining quota: {result().estimate.quota_remaining_characters} characters</Typography>
                        </Show>
                        <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>{result().estimate.note}</Typography>
                        <For each={result().checks}>{(check) => <div>{check.status === 'ready' ? '✓' : check.status === 'warning' ? '!' : '×'} {check.message}</div>}</For>
                    </Alert>}</Show>
                </Box>
            </Box>

            {/* Delete Confirmation Dialog */}
            <Dialog open={confirmDeleteMediaOpen()} onClose={() => setConfirmDeleteMediaOpen(false)}>
                <DialogTitle>Delete Media?</DialogTitle>
                <DialogContent>
                    Remove this cue and its takes from the catalog? Generated audio files will be retained on disk, and the catalog can be restored from a snapshot.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteMediaOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirmDeleteMedia} color="error">Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
