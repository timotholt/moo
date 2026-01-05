import { createSignal, createMemo, For, createEffect, Show, on } from 'solid-js';
import {
    Box, Typography, Button, List, IconButton, Paper, Divider,
    ToggleButtonGroup, ToggleButton, Select, MenuItem, FormControl, InputLabel, Stack
} from '@suid/material';
import ArrowUpwardIcon from '@suid/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@suid/icons-material/ArrowDownward';
import DeleteIcon from '@suid/icons-material/Delete';
import SaveIcon from '@suid/icons-material/Save';
import AddIcon from '@suid/icons-material/Add';
import PersonIcon from '@suid/icons-material/Person';
import FolderIcon from '@suid/icons-material/Folder';
import RecordVoiceOverIcon from '@suid/icons-material/RecordVoiceOver';
import SettingsIcon from '@suid/icons-material/Settings';
import AssessmentIcon from '@suid/icons-material/Assessment';
import EditIcon from '@suid/icons-material/Edit';
import CheckIcon from '@suid/icons-material/Check';
import CloseIcon from '@suid/icons-material/Close';
import RestartAltIcon from '@suid/icons-material/RestartAlt';
import { DIMENSIONS, getStickyName, PRESET_VIEWS } from '../utils/viewEngine.js';
import Collapse from './Collapse.jsx';
import TextInput from './TextInput.jsx';

export default function ViewConfigView(props) {
    // props: view, onUpdate, onDelete, operations, actorOps, sceneOps

    // Use a unique key for the view instance to reset signals ONLY when switching views
    const [name, setName] = createSignal('');
    const [levels, setLevels] = createSignal([]);
    const [filters, setFilters] = createSignal([]);
    const [quickAddValue, setQuickAddValue] = createSignal('');

    const [editingName, setEditingName] = createSignal(false);
    const [hierarchyExpanded, setHierarchyExpanded] = createSignal(true);
    const [filtersExpanded, setFiltersExpanded] = createSignal(true);

    // Initial sync and sync on view ID change
    createEffect(on(() => props.view?.id, (id) => {
        if (!props.view) return;
        setName(props.view.name || '');
        setLevels([...props.view.levels]);
        setFilters(Array.isArray(props.view.filter) ? [...props.view.filter] : []);
        setEditingName(false);
        setQuickAddValue('');
    }, { defer: false }));

    const stickyName = createMemo(() => getStickyName({ name: '', levels: levels() }));
    const displayTitle = createMemo(() => name() || stickyName());

    const handleSave = () => {
        props.onUpdate({
            ...props.view,
            name: name(),
            levels: levels(),
            filter: filters()
        });
    };

    const nextLevelType = createMemo(() => {
        const first = levels()[0];
        if (!first) return null;
        if (first.field === 'actor_id' || (first.field === 'owner_id' && first.labelMap?.actor)) return 'actor';
        if (first.field === 'scene_id' || (first.field === 'owner_id' && first.labelMap?.scene)) return 'scene';
        if (first.field === 'owner_type') return 'actor'; // Default to actor for owner_type
        return null;
    });

    const quickAddNames = createMemo(() => {
        return quickAddValue().split(',').map(s => s.trim()).filter(s => s.length > 0);
    });

    const handleQuickAdd = async (e) => {
        if (e) e.preventDefault();
        const type = nextLevelType();
        const names = quickAddNames();
        if (names.length === 0) return;

        if (type === 'actor') {
            for (const n of names) {
                await props.actorOps.createActor({ display_name: n });
            }
        } else if (type === 'scene') {
            for (const n of names) {
                await props.sceneOps.createScene({ name: n });
            }
        }
        setQuickAddValue('');
    };

    const moveLevel = (index, direction) => {
        const newLevels = [...levels()];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newLevels.length) return;
        [newLevels[index], newLevels[targetIndex]] = [newLevels[targetIndex], newLevels[index]];
        setLevels(newLevels);
    };

    const removeLevel = (index) => {
        const newLevels = levels().filter((_, i) => i !== index);
        setLevels(newLevels);
    };

    const addLevel = (dimId) => {
        const dim = DIMENSIONS.find(d => d.id === dimId);
        if (!dim) return;

        setLevels([...levels(), {
            field: dim.id,
            displayField: dim.displayField,
            icon: dim.icon,
            isTerminal: dim.isTerminal,
            labelMap: dim.labelMap
        }]);
    };

    const addFilter = () => {
        setFilters([...filters(), { field: 'status', op: 'ne', value: 'approved' }]);
    };

    const removeFilter = (idx) => {
        setFilters(filters().filter((_, i) => i !== idx));
    };

    const updateFilter = (idx, patch) => {
        setFilters(filters().map((f, i) => i === idx ? { ...f, ...patch } : f));
    };

    const availableDimensions = createMemo(() => {
        const usedFields = new Set(levels().map(l => l.field));
        return DIMENSIONS.filter(d => !usedFields.has(d.id));
    });

    const handleReset = () => {
        const preset = PRESET_VIEWS[props.view.id];
        if (!preset) return;
        setName(preset.name || '');
        setLevels([...preset.levels]);
        setFilters(Array.isArray(preset.filter) ? [...preset.filter] : []);
    };

    const isPreset = createMemo(() => props.view?.id ? !!PRESET_VIEWS[props.view.id] : false);

    const getIcon = (iconName) => {
        const sx = { fontSize: '1rem' };
        switch (iconName) {
            case 'person': return <PersonIcon sx={sx} />;
            case 'folder': return <FolderIcon sx={sx} />;
            case 'content': return <RecordVoiceOverIcon sx={sx} />;
            case 'type': return <SettingsIcon sx={sx} />;
            case 'status': return <AssessmentIcon sx={sx} />;
            default: return <SettingsIcon sx={sx} />;
        }
    };

    return (
        <Show when={props.view}>
            <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto' }}>
                {/* Header Section */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                    <Box sx={{ flexGrow: 1 }}>
                        <Show when={editingName()} fallback={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h5" fontWeight={700}>{displayTitle()}</Typography>
                                <IconButton size="small" onClick={() => setEditingName(true)}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        }>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 400 }}>
                                <TextInput
                                    size="small"
                                    fullWidth
                                    placeholder={stickyName()}
                                    value={name()}
                                    onValueChange={setName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') setEditingName(false);
                                        if (e.key === 'Escape') { setName(props.view.name); setEditingName(false); }
                                    }}
                                    autoFocus
                                />
                                <IconButton size="small" color="primary" onClick={() => setEditingName(false)}>
                                    <CheckIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => { setName(props.view.name); setEditingName(false); }}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Show>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            (if left blank "{stickyName()}" is used)
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Show when={isPreset()}>
                            <Button variant="outlined" color="primary" onClick={handleReset} startIcon={<RestartAltIcon />}>
                                Reset to Defaults
                            </Button>
                        </Show>
                        <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={props.onDelete}>
                            Delete
                        </Button>
                        <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSave}>
                            Save Changes
                        </Button>
                    </Box>
                </Box>

                {/* Smart Add Section */}
                <Show when={nextLevelType()}>
                    <Paper sx={{ mb: 4, borderRadius: '8px', overflow: 'hidden', boxShadow: 3, border: '2px solid', borderColor: 'primary.light' }}>
                        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Fast Track: Create {nextLevelType() === 'actor' ? 'Actors' : 'Scenes'}
                            </Typography>
                        </Box>
                        <Box sx={{ p: 3 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Type one or more names separated by commas (e.g. <b>John, Paul, Mary</b>) to batch create them into this project.
                            </Typography>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <TextInput
                                    fullWidth
                                    size="medium"
                                    placeholder={nextLevelType() === 'actor' ? "Enter actor names..." : "Enter scene names..."}
                                    value={quickAddValue()}
                                    onValueChange={setQuickAddValue}
                                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                                    sx={{ bgcolor: 'background.paper' }}
                                />
                                <Button
                                    variant="contained"
                                    color="primary"
                                    size="large"
                                    onClick={handleQuickAdd}
                                    disabled={quickAddNames().length === 0}
                                    startIcon={<AddIcon />}
                                    sx={{ height: '40px', px: 4, fontWeight: 700 }}
                                >
                                    Add {nextLevelType() === 'actor' ? 'Actor' : 'Scene'}{quickAddNames().length > 1 ? `s (${quickAddNames().length})` : ''}
                                </Button>
                            </Stack>
                        </Box>
                    </Paper>
                </Show>

                {/* Hierarchy Section */}
                <Paper sx={{ mb: 3, borderRadius: '8px', overflow: 'hidden' }}>
                    <Box
                        onClick={() => setHierarchyExpanded(!hierarchyExpanded())}
                        sx={{ p: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Grouping Hierarchy
                        </Typography>
                        {hierarchyExpanded() ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                    </Box>

                    <Collapse in={hierarchyExpanded()}>
                        <Box sx={{ p: 3 }}>
                            <List sx={{ mb: 3 }}>
                                <For each={levels()}>
                                    {(level, idx) => (
                                        <Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', py: 1, gap: 2 }}>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 24 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main' }}>{idx() + 1}</Typography>
                                                </Box>

                                                <Paper variant="outlined" sx={{ flexGrow: 1, p: '8px 16px', display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'action.hover' }}>
                                                    {getIcon(level.icon)}
                                                    <Typography variant="body1" sx={{ fontWeight: 600, flexGrow: 1 }}>
                                                        {DIMENSIONS.find(d => d.id === level.field)?.name || level.field}
                                                    </Typography>

                                                    <Box sx={{ display: 'flex' }}>
                                                        <IconButton size="small" onClick={() => moveLevel(idx(), -1)} disabled={idx() === 0}>
                                                            <ArrowUpwardIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton size="small" onClick={() => moveLevel(idx(), 1)} disabled={idx() === levels().length - 1}>
                                                            <ArrowDownwardIcon fontSize="small" />
                                                        </IconButton>
                                                        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                                                        <IconButton size="small" color="error" onClick={() => removeLevel(idx())}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Box>
                                                </Paper>
                                            </Box>
                                            {idx() < levels().length - 1 && (
                                                <Box sx={{ ml: '44px', borderLeft: '2px dashed', borderColor: 'divider', height: 16 }} />
                                            )}
                                        </Box>
                                    )}
                                </For>

                                {levels().length === 0 && (
                                    <Typography sx={{ py: 2, textAlign: 'center', color: 'text.disabled', fontStyle: 'italic' }}>
                                        No grouping levels defined. This view will show a flat list.
                                    </Typography>
                                )}
                            </List>

                            <Box sx={{ mt: 2 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                                    Add Dimension
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    <For each={availableDimensions()}>
                                        {(dim) => (
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<AddIcon fontSize="small" />}
                                                onClick={() => addLevel(dim.id)}
                                                sx={{ borderRadius: '16px' }}
                                            >
                                                {dim.name}
                                            </Button>
                                        )}
                                    </For>
                                </Box>
                            </Box>
                        </Box>
                    </Collapse>
                </Paper>

                {/* Filters Section */}
                <Paper sx={{ mb: 3, borderRadius: '8px', overflow: 'hidden' }}>
                    <Box
                        onClick={() => setFiltersExpanded(!filtersExpanded())}
                        sx={{ p: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Filters (Selection Criteria)
                        </Typography>
                        {filtersExpanded() ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                    </Box>

                    <Collapse in={filtersExpanded()}>
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                                <Button size="small" startIcon={<AddIcon />} onClick={addFilter}>
                                    Add Rule
                                </Button>
                            </Box>

                            <Show when={filters().length > 0} fallback={
                                <Typography sx={{ py: 2, textAlign: 'center', color: 'text.disabled', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                    No filters active. Showing all project items.
                                </Typography>
                            }>
                                <Stack spacing={2}>
                                    <For each={filters()}>
                                        {(filter, idx) => (
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <FormControl size="small" sx={{ width: 140 }}>
                                                    <InputLabel>Field</InputLabel>
                                                    <Select
                                                        value={filter.field}
                                                        label="Field"
                                                        onChange={(e) => updateFilter(idx(), { field: e.target.value })}
                                                    >
                                                        <For each={DIMENSIONS}>
                                                            {(dim) => <MenuItem value={dim.id}>{dim.name}</MenuItem>}
                                                        </For>
                                                    </Select>
                                                </FormControl>

                                                <FormControl size="small" sx={{ width: 120 }}>
                                                    <InputLabel>Operator</InputLabel>
                                                    <Select
                                                        value={filter.op}
                                                        label="Operator"
                                                        onChange={(e) => updateFilter(idx(), { op: e.target.value })}
                                                    >
                                                        <MenuItem value="eq">is</MenuItem>
                                                        <MenuItem value="ne">is not</MenuItem>
                                                        <MenuItem value="contains">contains</MenuItem>
                                                        <MenuItem value="regex">regex</MenuItem>
                                                    </Select>
                                                </FormControl>

                                                <TextInput
                                                    size="small"
                                                    label="Value"
                                                    value={filter.value || ''}
                                                    onValueChange={(val) => updateFilter(idx(), { value: val })}
                                                    sx={{ flexGrow: 1 }}
                                                />

                                                <IconButton size="small" color="error" onClick={() => removeFilter(idx())}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        )}
                                    </For>
                                </Stack>
                            </Show>
                            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center' }}>Presets:</Typography>
                                <Button size="small" variant="text" onClick={() => setFilters([{ field: 'status', op: 'ne', value: 'approved' }])}>
                                    Only Unapproved
                                </Button>
                                <Button size="small" variant="text" onClick={() => setFilters([{ field: 'status', op: 'eq', value: 'approved' }])}>
                                    Only Approved
                                </Button>
                            </Box>
                        </Box>
                    </Collapse>
                </Paper>
            </Box>
        </Show>
    );
}
