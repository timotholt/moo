import { createSignal, createMemo, Show } from 'solid-js';
import {
    Box, Typography, Stack, Button, Paper,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions
} from '@suid/material';
import TextInput from '../TextInput.jsx';
import DetailHeader from '../DetailHeader.jsx';
import CompleteButton from '../CompleteButton.jsx';
import BinManagement from '../BinManagement.jsx';
import DefaultBlockManager from '../DefaultBlockManager.jsx';
import { DIMENSIONS } from '../../utils/viewEngine.js';
import AddIcon from '@suid/icons-material/Add';

export default function SceneView(props) {
    // props: scene, bins, operations (useDataOperations result), viewConfig, groupNode, actorOps, sceneOps, projectDefaults

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

    const [batchActorNames, setBatchActorNames] = createSignal('');
    const parsedActorNames = createMemo(() => batchActorNames().split(',').map(s => s.trim()).filter(s => s.length > 0));

    const handleAddActors = async () => {
        const names = parsedActorNames();
        if (names.length === 0) return;

        const newActorIds = [];
        for (const name of names) {
            const actorResult = await props.actorOps.createActor({ display_name: name });
            const actorId = actorResult?.actor?.id;
            if (actorId) newActorIds.push(actorId);
        }

        if (newActorIds.length > 0) {
            const currentIds = props.scene.actor_ids || [];
            await props.sceneOps.updateScene(props.scene.id, {
                actor_ids: Array.from(new Set([...currentIds, ...newActorIds]))
            });
        }
        setBatchActorNames('');
    };

    const handleStartEdit = () => {
        setTempName(props.scene.name);
        setEditingName(true);
    };

    const handleSaveName = async () => {
        if (tempName() && tempName() !== props.scene.name) {
            await props.operations.updateSceneField(props.scene.id, { name: tempName() });
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
        await props.operations.deleteScene(props.scene.id, props.scene.name);
    };

    const handleToggleComplete = async () => {
        const newStatus = !props.scene.scene_complete;
        await props.operations.updateSceneField(props.scene.id, { scene_complete: newStatus });
    };

    return (
        <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
            <DetailHeader
                title={props.scene.name}
                subtitle={`Scene ID: ${props.scene.id}`}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
                isEditing={editingName()}
                editValue={tempName()}
                onEditChange={setTempName}
                onEditSave={handleSaveName}
                onEditCancel={handleCancelEdit}
                rightActions={
                    <CompleteButton
                        isComplete={props.scene.scene_complete}
                        onToggle={handleToggleComplete}
                        itemType="scene"
                    />
                }
            />

            <Stack spacing={4} sx={{ mt: 2 }}>
                <Show when={nextLevelDim()?.id === 'actor_id'}>
                    <Paper sx={{ p: 3, borderRadius: '8px', border: '2px solid', borderColor: 'primary.light', bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, color: 'primary.main' }}>
                            Fast Track: Add Actors for this Scene
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Enter actor names (comma-separated) to create actors and linked media for {props.scene.name}.
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <TextInput
                                fullWidth
                                size="small"
                                placeholder="e.g. Hero, Villain, Narrator"
                                value={batchActorNames()}
                                onValueChange={setBatchActorNames}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddActors()}
                            />
                            <Button
                                variant="contained"
                                onClick={handleAddActors}
                                disabled={parsedActorNames().length === 0}
                                startIcon={<AddIcon />}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                Add Actor{parsedActorNames().length > 1 ? `s (${parsedActorNames().length})` : ''}
                            </Button>
                        </Stack>
                    </Paper>
                </Show>

                <DefaultBlockManager
                    owner={props.scene}
                    ownerType="scene"
                    parent={null}
                    projectDefaults={props.projectDefaults}
                    voices={props.operations.voices()}
                    loadingVoices={props.operations.loadingVoices()}
                    onUpdate={(newBlocks) => {
                        props.operations.updateSceneField(props.scene.id, {
                            default_blocks: newBlocks
                        });
                    }}
                />

                <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {nextLevelDim()?.id === 'bin_id' ? 'Manage Media/Bins' : 'Dialogue Media'}
                    </Typography>
                    <BinManagement
                        owner={props.scene}
                        ownerType="scene"
                        bins={props.bins}
                        onCreateBin={props.operations.createBin}
                        creatingMedia={props.operations.creatingMedia()}
                    />
                </Box>
            </Stack>

            <Dialog
                open={deleteDialogOpen()}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Delete Scene?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete <strong>{props.scene.name}</strong>?
                        This will delete all bins, media, and takes associated with this scene.
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
