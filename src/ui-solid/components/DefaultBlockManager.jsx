import { createSignal, createMemo, For, Show } from 'solid-js';
import {
    Box, Typography, Button, Paper, IconButton, Menu, MenuItem, Stack
} from '@suid/material';
import DeleteIcon from '@suid/icons-material/Delete';
import AddIcon from '@suid/icons-material/Add';
import ProviderSettingsEditor from './ProviderSettingsEditor.jsx';
import { getInheritedSettings } from '../utils/inheritance.js';

export default function DefaultBlockManager(props) {
    // props: 
    //   owner: the object containing default_blocks (actor, scene, or bin)
    //   parent: the immediate parent object (optional)
    //   projectDefaults: Global defaults from server
    //   onUpdate: function(newDefaultBlocks) to call when settings change
    //   voices: voice list
    //   loadingVoices: loading state for voices

    const [anchorEl, setAnchorEl] = createSignal(null);
    const open = () => Boolean(anchorEl());

    const availableTypes = ['dialogue', 'music', 'sfx'];
    const currentBlocks = () => props.owner.default_blocks || {};
    const existingTypes = () => Object.keys(currentBlocks());
    const unusedTypes = () => availableTypes.filter(t => !existingTypes().includes(t));

    const handleAddClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleAddType = (type) => {
        // When adding a new block, we default it to 'inherit'
        const next = { ...currentBlocks(), [type]: { provider: 'inherit' } };
        props.onUpdate(next);
        handleClose();
    };

    const handleRemoveType = (type) => {
        const next = { ...currentBlocks() };
        delete next[type];
        props.onUpdate(next);
    };

    const handleSettingsChange = (type, settings) => {
        const next = { ...currentBlocks(), [type]: settings };
        props.onUpdate(next);
    };

    // Calculate inherited settings for a specific type at THIS level.
    // This level's inherited settings come from its parent (and its parent's parent, etc.)
    const getEffectiveInherited = (type) => {
        // For a Manager sitting in an Actor/Scene, parent is usually null (Project)
        // For a Manager sitting in a Bin, parent is an Actor or Scene.
        return getInheritedSettings(type, {
            owner: props.parent, // In this lookup, our parent is the 'owner' level
            projectDefaults: props.projectDefaults
        });
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Add-on Default Blocks
                </Typography>
                <Show when={unusedTypes().length > 0}>
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleAddClick}
                        variant="outlined"
                        sx={{ borderRadius: '16px', textTransform: 'none' }}
                    >
                        Add Block
                    </Button>
                </Show>
            </Box>

            <Menu
                anchorEl={anchorEl()}
                open={open()}
                onClose={handleClose}
            >
                <For each={unusedTypes()}>
                    {(type) => (
                        <MenuItem onClick={() => handleAddType(type)} sx={{ textTransform: 'capitalize' }}>
                            {type} Defaults
                        </MenuItem>
                    )}
                </For>
            </Menu>

            <For each={existingTypes()}>
                {(type) => (
                    <Paper
                        variant="outlined"
                        sx={{
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid',
                            borderColor: 'divider'
                        }}
                    >
                        <Box sx={{
                            p: 1.5,
                            bgcolor: 'action.hover',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, color: 'primary.main' }}>
                                {type} Defaults
                            </Typography>
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveType(type)}
                                sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                        <Box sx={{ p: 2 }}>
                            <ProviderSettingsEditor
                                mediaType={type}
                                settings={currentBlocks()[type]}
                                inheritedSettings={getEffectiveInherited(type)}
                                voices={props.voices}
                                loadingVoices={props.loadingVoices}
                                allowInherit={true}
                                onSettingsChange={(settings) => handleSettingsChange(type, settings)}
                            />
                        </Box>
                    </Paper>
                )}
            </For>

            <Show when={existingTypes().length === 0}>
                <Box sx={{
                    p: 3,
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                    <Typography variant="body2" color="text.secondary">
                        No custom defaults added to this {props.ownerType || 'item'}.
                        It is currently borrowing all settings from its ancestors.
                    </Typography>
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleAddClick}
                        sx={{ mt: 1 }}
                    >
                        Add your first Default Block
                    </Button>
                </Box>
            </Show>
        </Stack>
    );
}
