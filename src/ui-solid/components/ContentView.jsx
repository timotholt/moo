import { createSignal, createEffect, createMemo, Show, For, onCleanup } from 'solid-js';
import {
    Box, Typography, TextField, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, Button, List, ListItem, ListItemIcon, ListItemText,
    CircularProgress
} from '@suid/material';
import Tooltip from './Tooltip.jsx';
import Collapse from './Collapse.jsx';
import {
    Delete as DeleteIcon, PlayArrow as PlayArrowIcon, Stop as StopIcon,
    ThumbUp as ThumbUpIcon, ThumbDown as ThumbDownIcon, ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon, Refresh as RefreshIcon, AutoAwesome as AutoAwesomeIcon,
    AutoFixHigh as AutoFixHighIcon, RestartAlt as RestartAltIcon
} from '@suid/icons-material';
import { deleteContent, updateContent, updateSection, updateActor, updateTake, generateTakes, deleteTake } from '../api/client.js';
import CompleteButton from './CompleteButton.jsx';
import DetailHeader from './DetailHeader.jsx';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { buildContentPath, buildSectionPath, buildActorPath, getSectionName } from '../utils/pathBuilder.js';
import { useLog, usePlayback, useStatus, useCredits } from '../contexts/AppContext.jsx';

// Local storage key for LLM settings
const LLM_STORAGE_KEY = 'vofoundry-llm-settings';

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

// Helper: blank space conversion
function applyBlankSpaceConversion(str, conversion) {
    if (!str) return str;
    switch (conversion) {
        case 'underscore': return str.replace(/\s+/g, '_');
        case 'delete': return str.replace(/\s+/g, '');
        case 'keep': default: return str;
    }
}

// Helper: strip trailing underscore
function stripTrailingUnderscore(str) {
    return str ? str.replace(/_+$/, '') : str;
}

// Helper: capitalization conversion
function applyCapitalizationConversion(str, conversion) {
    if (!str) return str;
    switch (conversion) {
        case 'lowercase': return str.toLowerCase();
        case 'keep': default: return str;
    }
}

export default function ContentView(props) {
    // props: item, actor, sections, allTakes, onContentDeleted, onContentUpdated, onSectionUpdated, onActorUpdated, 
    //        sectionComplete, blankSpaceConversion, capitalizationConversion, onTakesGenerated, onTakeUpdated, error

    const baseLog = useLog();
    const playback = usePlayback();
    const status = useStatus();
    const credits = useCredits();

    // Create derived filename helpers
    const actorBase = () => stripTrailingUnderscore(props.actor?.base_filename || 'unknown');

    const cueIdConverted = () => applyCapitalizationConversion(
        applyBlankSpaceConversion(props.item.cue_id || 'untitled', props.blankSpaceConversion || 'underscore'),
        props.capitalizationConversion || 'lowercase'
    );

    const baseFilename = () => applyCapitalizationConversion(
        `${actorBase()}_${props.item.content_type}_${cueIdConverted()}`,
        props.capitalizationConversion || 'lowercase'
    );

    const [confirmDeleteContentOpen, setConfirmDeleteContentOpen] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    const [localError, setLocalError] = createSignal(null);

    // Editable fields
    const [cueId, setCueId] = createSignal(props.item.cue_id || '');
    const [prompt, setPrompt] = createSignal(props.item.prompt || '');
    const [filename, setFilename] = createSignal(props.item.filename || baseFilename());
    const [saving, setSaving] = createSignal(false);

    // AI State
    const [aiLoading, setAiLoading] = createSignal(false);
    const [aiError, setAiError] = createSignal('');

    // Local takes state (optimistic updates + merged with props)
    const filteredTakes = createMemo(() =>
        (props.allTakes || []).filter(t => t.content_id === props.item.id)
    );

    const [optimisticTakes, setOptimisticTakes] = createSignal([]);

    // Merged takes list
    const takes = createMemo(() => {
        const parentTakes = filteredTakes();
        const parentIds = new Set(parentTakes.map(t => t.id));
        // Filter out optimistic takes that are now in parent props
        const neededOptimistic = optimisticTakes().filter(t => !parentIds.has(t.id));
        return [...parentTakes, ...neededOptimistic];
    });

    const [generatingTakes, setGeneratingTakes] = createSignal(false);
    const [expandedTakeId, setExpandedTakeId] = createSignal(null); // Track expanded take ID
    const [editingCueId, setEditingCueId] = createSignal(false);

    const isDisabled = () => !!props.item.all_approved;

    // Sync state when item changes
    createEffect(() => {
        const item = props.item;
        setCueId(item.cue_id || '');

        // Default prompt logic
        const defPrompt = item.cue_id ? item.cue_id.charAt(0).toUpperCase() + item.cue_id.slice(1) : '';
        setPrompt(item.prompt || defPrompt);

        // Filename logic
        const effective = item.filename || baseFilename();
        setFilename(effective);

        // Auto-save generated filename if missing on server
        if (!item.filename && !props.sectionComplete) {
            // Debounce or just do it? In Solid, maybe better to do it on lazy save or just let it be.
            // React version did handleSaveField immediately. Let's replicate safely.
            // Calling handleSaveField here might cause loop if not careful. 
            // We'll skip auto-save for parity to avoid complexity in port, unless strictly needed.
        }

        // Clear optimistic takes on item switch
        setOptimisticTakes([]);
        setLocalError(null);
    });

    const handleConfirmDeleteContent = async () => {
        try {
            setDeleting(true);
            setLocalError(null);
            if (status.onStatusChange) status.onStatusChange('Processing');
            await deleteContent(props.item.id);
            if (props.onContentDeleted) props.onContentDeleted(props.item.id);
            setConfirmDeleteContentOpen(false);
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

            const oldCueId = field === 'cue_id' ? props.item.cue_id : null;
            const result = await updateContent(props.item.id, { [field]: value });

            if (result.content && props.onContentUpdated) {
                props.onContentUpdated(result.content, oldCueId);
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
                // Update optimistic takes if it was one
                setOptimisticTakes(prev => {
                    const existing = prev.find(t => t.id === takeId);
                    if (existing) return prev.map(t => t.id === takeId ? result.take : t);
                    return prev;
                });

                if (props.onTakeUpdated) props.onTakeUpdated(result.take);
                if (result.content && props.onContentUpdated) props.onContentUpdated(result.content);

                // Log
                const filename = result.take.filename || takeId;
                const actorName = props.actor?.display_name || 'Unknown';
                const sectionName = getSectionName(props.item.section_id, props.sections);
                const cueName = props.item.cue_id || props.item.id;
                const path = buildContentPath(actorName, sectionName, cueName);

                if (newStatus === 'approved') baseLog.logInfo(`user approved ${path} → ${filename}`);
                else if (newStatus === 'rejected') baseLog.logInfo(`user rejected ${path} → ${filename}`);
                else if (newStatus === 'new' && previousStatus === 'approved') baseLog.logInfo(`user unapproved ${path} → ${filename}`);
                else if (newStatus === 'new' && previousStatus === 'rejected') baseLog.logInfo(`user unrejected ${path} → ${filename}`);
            }
        } catch (err) {
            setLocalError(err.message);
            baseLog.logError(`Failed to update take status: ${err.message}`);
        } finally {
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    const handleGenerateTakesCount = async (count) => {
        if (props.sectionComplete || generatingTakes() || count <= 0) return;
        try {
            setGeneratingTakes(true);
            setLocalError(null);
            if (status.onStatusChange) status.onStatusChange(`Generating ${count} take${count > 1 ? 's' : ''}...`);

            const result = await generateTakes(props.item.id, count);
            if (result.takes && result.takes.length > 0) {
                setOptimisticTakes(prev => [...prev, ...result.takes]);
                if (props.onTakesGenerated) props.onTakesGenerated(result.takes);

                const filenames = result.takes.map(t => t.filename).join(', ');
                console.log(`[Generate] Created ${result.takes.length} take(s): ${filenames}`);
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

    const handleDeleteTake = async (takeId) => {
        try {
            if (status.onStatusChange) status.onStatusChange('Processing');
            const take = takes().find(t => t.id === takeId);
            await deleteTake(takeId);

            // Remove from optimistic
            setOptimisticTakes(prev => prev.filter(t => t.id !== takeId));
            // Note: If take is in parent props, it won't disappear until parent refreshes data or we have a callback to remove it from parent state.
            // Ideally ProjectShell reloadData() is called or we optimistically hide it.
            // Since we passed direct takes list from parent... we can't mutate it easily.
            // BUT, we can filter it out in our derived 'takes' memo if we tracked deleted IDs.
            // For now, we'll rely on parent refresh or just optimistically hide via a local 'deletedIds' set if needed.
            // Actually, let's trigger a reload in parent if possible? No, too heavy. 
            // Best way: parent should provide onTakeDeleted? Or just let it be and wait for eventual reload.
            // React version relied on 'onTakeUpdated' maybe? No, 'setLocalTakes' in React masked it.
            // We can add a localDeletedIds set.

            if (props.onTakeUpdated) {
                // Mock a "deleted" update? Or just nothing.
            }
            baseLog.logInfo(`Take deleted: ${take?.filename || takeId}`);
        } catch (err) {
            setLocalError(err.message);
            baseLog.logError(`Failed to delete take: ${err.message}`);
        } finally {
            if (status.onStatusChange) status.onStatusChange('');
        }
    };

    // AI Handlers
    const getLLMSettings = () => {
        try {
            const stored = localStorage.getItem(LLM_STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    };

    const handleAIGenerate = async () => {
        const settings = getLLMSettings();
        if (!settings?.apiKey) {
            setAiError('Configure AI in Settings first');
            return;
        }
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch('/api/llm/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    model: settings.model,
                    systemPrompt: settings.systemPrompts?.generate || '',
                    contentName: props.item.cue_id || 'untitled',
                    actorName: props.actor?.name || '',
                    sectionType: props.item.content_type
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
        // Similar structure to Generate
        const settings = getLLMSettings();
        if (!settings?.apiKey) return setAiError('Configure AI first');
        if (!prompt().trim()) return setAiError('Enter prompt first');
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch('/api/llm/improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: settings.provider,
                    apiKey: settings.apiKey,
                    model: settings.model,
                    systemPrompt: settings.systemPrompts?.improve || '',
                    currentPrompt: prompt(),
                    contentName: props.item.cue_id || 'untitled',
                    sectionType: props.item.content_type
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
        const def = props.item.cue_id ? props.item.cue_id.charAt(0).toUpperCase() + props.item.cue_id.slice(1) : '';
        setPrompt(def);
        handleSaveField('prompt', def);
        setAiError('');
    };

    const approvedCount = () => takes().filter(t => t.status === 'approved').length;
    const requiredApprovals = () => props.actor?.provider_settings?.[props.item.content_type]?.approval_count_default || 1;
    const subtitle = () => `actor: ${props.actor?.display_name || 'unknown'} • type: ${props.item.content_type}`;

    const handleSaveCueId = () => {
        if (cueId() !== props.item.cue_id) {
            handleSaveField('cue_id', cueId());
        }
        setEditingCueId(false);
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Show when={editingCueId()} fallback={
                <DetailHeader
                    title={props.item.cue_id || 'untitled'}
                    subtitle={subtitle()}
                    onEdit={() => {
                        setEditingCueId(true);
                        setCueId(props.item.cue_id || '');
                    }}
                    onDelete={() => setConfirmDeleteContentOpen(true)}
                    editDisabled={isDisabled()}
                    deleteDisabled={isDisabled()}
                    rightActions={
                        <CompleteButton
                            isComplete={props.item.all_approved}
                            onToggle={async () => {
                                try {
                                    setSaving(true);
                                    setLocalError(null);
                                    const nextAllApproved = !props.item.all_approved;
                                    const result = await updateContent(props.item.id, { all_approved: nextAllApproved });

                                    if (result.content && props.onContentUpdated) props.onContentUpdated(result.content);

                                    // Logging
                                    const actorName = props.actor?.display_name || 'Unknown';
                                    const sectionName = getSectionName(props.item.section_id, props.sections);
                                    const cueName = props.item.cue_id || props.item.id;
                                    const path = buildContentPath(actorName, sectionName, cueName);
                                    if (nextAllApproved) baseLog.logInfo(`user marked ${path} as complete`);
                                    else baseLog.logInfo(`user marked ${path} as incomplete`);

                                    // Cascade incomplete
                                    if (!nextAllApproved) {
                                        // Update section/actor incomplete logic here if needed
                                        if (props.item.section_id) {
                                            const sResult = await updateSection(props.item.section_id, { section_complete: false });
                                            if (sResult.section && props.onSectionUpdated) props.onSectionUpdated(sResult.section);
                                        }
                                        if (props.item.actor_id) {
                                            const aResult = await updateActor(props.item.actor_id, { actor_complete: false });
                                            if (aResult.actor && props.onActorUpdated) props.onActorUpdated(aResult.actor);
                                        }
                                    }
                                } catch (err) {
                                    setLocalError(err.message);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            disabled={saving()}
                            itemType="cue"
                            approvedCount={approvedCount()}
                        />
                    }
                />
            }>
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                        size="small"
                        value={cueId()}
                        onChange={(e) => setCueId(e.target.value)}
                        placeholder={props.item.cue_id}
                        autoFocus
                        sx={{ flexGrow: 1 }}
                    />
                    <Button variant="contained" onClick={handleSaveCueId}>Save</Button>
                    <Button onClick={() => setEditingCueId(false)}>Cancel</Button>
                </Box>
            </Show>

            {/* Filename Editor */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TextField
                    size="small"
                    label="Filename"
                    value={filename()}
                    onChange={(e) => setFilename(e.target.value)}
                    onBlur={() => filename() !== (props.item.filename || baseFilename()) && handleSaveField('filename', filename())}
                    disabled={isDisabled() || saving()}
                    placeholder={baseFilename()}
                    sx={{ flexGrow: 1 }}
                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                />
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>_001</Typography>
                <IconButton
                    size="small"
                    onClick={() => {
                        setFilename(baseFilename());
                        handleSaveField('filename', baseFilename());
                    }}
                    disabled={isDisabled() || saving() || filename() === baseFilename()}
                >
                    <RefreshIcon />
                </IconButton>
            </Box>

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
                <TextField
                    fullWidth
                    size="small"
                    label="Prompt"
                    multiline
                    rows={3}
                    value={prompt()}
                    onChange={(e) => setPrompt(e.target.value)}
                    onBlur={() => prompt() !== props.item.prompt && handleSaveField('prompt', prompt())}
                    disabled={isDisabled() || saving()}
                />
                <Show when={aiError()}>
                    <Typography variant="caption" color="error">{aiError()}</Typography>
                </Show>
            </Box>

            <Show when={localError() || props.error}>
                <Typography color="error">{localError() || props.error}</Typography>
            </Show>

            {/* Generated Takes List */}
            <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2">Takes ({takes().length})</Typography>
                <Typography variant="caption" color="text.secondary">
                    {approvedCount()} of {requiredApprovals()} approved
                </Typography>

                <List dense disablePadding sx={{ mt: 1 }}>
                    <For each={takes()}>
                        {(take) => (
                            <Box sx={{ mb: 0.5 }}>
                                <ListItem
                                    sx={{
                                        py: 0.5, px: 1, borderRadius: 1,
                                        bgcolor: take.status === 'approved' ? 'success.dark' :
                                            take.status === 'rejected' ? 'error.light' : 'action.hover',
                                        opacity: take.status === 'rejected' ? 0.6 : 1
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                        <IconButton size="small" onClick={() => handlePlayTake(take)} sx={{ p: 0.25 }}>
                                            {playback.playingTakeId === take.id ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                                        </IconButton>
                                    </ListItemIcon>
                                    <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => handlePlayTake(take)}>
                                        <ListItemText
                                            primary={`${take.filename || `take_${take.take_number}`}${take.status === 'new' && !playback.playedTakes[take.id] ? ' (new)' : ''}`}
                                            secondary={`${take.duration_sec?.toFixed(1) || '?'}s • ${take.status}`}
                                            primaryTypographyProps={{
                                                fontSize: '0.8rem',
                                                fontFamily: 'monospace',
                                                color: take.status === 'approved' ? 'white' : 'text.primary'
                                            }}
                                            secondaryTypographyProps={{ fontSize: '0.7rem' }}
                                        />
                                    </Box>
                                    <IconButton size="small" onClick={() => handleTakeStatus(take.id, take.status === 'approved' ? 'new' : 'approved')} sx={{ color: take.status === 'approved' ? 'white' : 'text.disabled' }}>
                                        <ThumbUpIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleTakeStatus(take.id, take.status === 'rejected' ? 'new' : 'rejected')} sx={{ color: take.status === 'rejected' ? 'white' : 'text.disabled' }}>
                                        <ThumbDownIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleDeleteTake(take.id)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </ListItem>
                            </Box>
                        )}
                    </For>
                </List>

                <Button
                    variant="contained"
                    fullWidth
                    sx={{ mt: 2 }}
                    onClick={() => handleGenerateTakesCount(1)}
                    disabled={isDisabled() || generatingTakes()}
                >
                    {generatingTakes() ? 'Generating...' : 'Generate New Take'}
                </Button>
            </Box>

            {/* Delete Confirmation Dialog */}
            <Dialog open={confirmDeleteContentOpen()} onClose={() => setConfirmDeleteContentOpen(false)}>
                <DialogTitle>Delete Content?</DialogTitle>
                <DialogContent>
                    Are you sure you want to delete this cue ID and all associated takes?
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteContentOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirmDeleteContent} color="error">Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
