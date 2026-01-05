import { createSignal, createMemo, Show } from 'solid-js';
import {
    Box, Typography, TextField, Stack, Paper,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button
} from '@suid/material';
import DetailHeader from '../DetailHeader.jsx';
import CompleteButton from '../CompleteButton.jsx';
import SectionManagement from '../SectionManagement.jsx';
import ProviderSettingsEditor from '../ProviderSettingsEditor.jsx';

import { DIMENSIONS } from '../../utils/viewEngine.js';
import AddIcon from '@suid/icons-material/Add';

export default function ActorView(props) {
    // props: actor, sections, operations (useDataOperations result), viewConfig, groupNode

    const nextLevel = createMemo(() => {
        if (!props.viewConfig || !props.groupNode) return null;
        const levels = props.viewConfig.levels;
        const index = levels.findIndex(l => l.field === props.groupNode.field);
        if (index === -1 || index >= levels.length - 1) return null;
        return levels[index + 1];
    });

    const nextLevelDim = createMemo(() => {
        if (!nextLevel()) return null;
        return DIMENSIONS.find(d => d.id === nextLevel().field);
    });

    const [editingName, setEditingName] = createSignal(false);
    const [tempName, setTempName] = createSignal('');
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);

    const handleStartEdit = () => {
        setTempName(props.actor.display_name);
        setEditingName(true);
    };

    const handleSaveName = async () => {
        if (tempName() && tempName() !== props.actor.display_name) {
            await props.operations.updateActorField(props.actor.id, { display_name: tempName() });
        }
        setEditingName(false);
    };

    const handleCancelEdit = () => {
        setEditingName(false);
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        setDeleteDialogOpen(false);
        await props.operations.deleteActor(props.actor.id, props.actor.display_name);
    };

    const handleToggleComplete = async () => {
        const newStatus = !props.actor.actor_complete;
        await props.operations.updateActorField(props.actor.id, { actor_complete: newStatus });
    };

    const [batchSceneNames, setBatchSceneNames] = createSignal('');
    const parsedSceneNames = createMemo(() => batchSceneNames().split(',').map(s => s.trim()).filter(s => s.length > 0));

    const handleAddScenes = async () => {
        const names = parsedSceneNames();
        if (names.length === 0) return;

        try {
            for (const name of names) {
                // 1. Create the scene and link it directly to this actor
                await props.sceneOps.createScene({
                    name,
                    actor_ids: [props.actor.id]
                });
            }
        } catch (err) {
            console.error('[ActorView] Error in batch scene creation:', err);
            // TODO: Show error toast
        } finally {
            setBatchSceneNames('');
        }
    };

    return (
        <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
            <DetailHeader
                title={props.actor.display_name}
                subtitle={`Actor ID: ${props.actor.id}`}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
                deleteDisabled={props.operations.deleting && props.operations.deleting()}
                isEditing={editingName()}
                editValue={tempName()}
                onEditChange={setTempName}
                onEditSave={handleSaveName}
                onEditCancel={handleCancelEdit}
                rightActions={
                    <CompleteButton
                        isComplete={props.actor.actor_complete}
                        onToggle={handleToggleComplete}
                        itemType="actor"
                    />
                }
            />

            <Stack spacing={4} sx={{ mt: 2 }}>
                {/* Context-Aware Fast Track */}
                <Show when={nextLevelDim()?.id === 'scene_id'}>
                    <Paper sx={{ p: 3, borderRadius: '8px', border: '2px solid', borderColor: 'primary.light', bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, color: 'primary.main' }}>
                            Fast Track: Add Scenes for this Actor
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Enter scene names (comma-separated) to automatically create scenes and linked cues for {props.actor.display_name}.
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="e.g. Opening Scene, Forest Chase, Finale" on:input={(e) => setBatchSceneNames(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddScenes()}
                            />
                            <Button
                                variant="contained"
                                onClick={handleAddScenes}
                                disabled={parsedSceneNames().length === 0}
                                startIcon={<AddIcon />}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                Add Scene{parsedSceneNames().length > 1 ? `s (${parsedSceneNames().length})` : ''}
                            </Button>
                        </Stack>
                    </Paper>
                </Show>

                <Box>
                    <Typography variant="overline" color="text.secondary">
                        Base Filename
                    </Typography>
                    <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {props.actor.base_filename || 'Not set'}
                    </Typography>
                </Box>

                {/* Default Blocks */}
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                    <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2">Default Voice Settings (Dialogue)</Typography>
                    </Box>
                    <Box sx={{ p: 2 }}>
                        <ProviderSettingsEditor
                            contentType="dialogue"
                            settings={props.actor.default_blocks?.dialogue}
                            voices={props.operations.voices()}
                            loadingVoices={props.operations.loadingVoices()}
                            allowInherit={true}
                            onSettingsChange={(settings) => {
                                const current = props.actor.default_blocks || {};
                                props.operations.updateActorField(props.actor.id, {
                                    default_blocks: { ...current, dialogue: settings }
                                });
                            }}
                        />
                    </Box>
                </Box>

                {/* Section Management */}
                <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {nextLevelDim()?.id === 'section_id' ? 'Manage Cues/Sections' : 'Dialogue Cues'}
                    </Typography>
                    <SectionManagement
                        owner={props.actor}
                        ownerType="actor"
                        sections={props.sections}
                        onCreateSection={props.operations.createSection}
                        creatingContent={props.operations.creatingContent()}
                    />
                </Box>
            </Stack>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen()}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Delete Actor?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete <strong>{props.actor.display_name}</strong>?
                        This will delete all sections, content, and takes associated with this actor.
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" autoFocus>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
