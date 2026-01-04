import { createSignal, createMemo, For } from 'solid-js';
import {
    Box, Typography, TextField, Button, List, IconButton, Paper, Divider,
    ToggleButtonGroup, ToggleButton
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

import { DIMENSIONS, getStickyName } from '../utils/viewEngine.js';

export default function ViewConfigView(props) {
    // props: view, onUpdate, onDelete

    const [name, setName] = createSignal(props.view.name);
    const [levels, setLevels] = createSignal([...props.view.levels]);

    const displayTitle = createMemo(() => getStickyName({ name: name(), levels: levels() }));

    const handleSave = () => {
        props.onUpdate({
            ...props.view,
            name: name(),
            levels: levels()
        });
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

    const availableDimensions = createMemo(() => {
        const usedFields = new Set(levels().map(l => l.field));
        return DIMENSIONS.filter(d => !usedFields.has(d.id));
    });

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
        <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{displayTitle()}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Configure how this {props.view.category} bins and organizes your project data.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={props.onDelete}>
                        Delete
                    </Button>
                    <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSave}>
                        Save Changes
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ p: 3, mb: 3, borderRadius: '8px' }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Identity
                </Typography>
                <TextField
                    fullWidth
                    label="Custom Name"
                    placeholder={`Leave blank to use "${getStickyName({ name: '', levels: levels() })}"`}
                    value={name()}
                    onInput={(e) => setName(e.target.value)}
                    variant="outlined"
                    sx={{ mb: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                    Changes here only affect the sidebar label. The logic remains purely based on the hierarchy below.
                </Typography>
            </Paper>

            <Paper sx={{ p: 3, borderRadius: '8px' }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Grouping Hierarchy
                </Typography>

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
            </Paper>
        </Box>
    );
}
