import { createSignal, Show } from 'solid-js';
import {
    Box, Typography, TextField, Stack,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button
} from '@suid/material';
import DetailHeader from '../DetailHeader.jsx';
import CompleteButton from '../CompleteButton.jsx';
import SectionManagement from '../SectionManagement.jsx';
import ProviderSettingsEditor from '../ProviderSettingsEditor.jsx';

export default function ActorView(props) {
    // props: actor, sections, operations (useDataOperations result)

    const [editingName, setEditingName] = createSignal(false);
    const [tempName, setTempName] = createSignal('');
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
    const [isFinalActor, setIsFinalActor] = createSignal(false); // Logic for this would need to come from parent or be calculated

    const handleStartEdit = () => {
        setTempName(props.actor.display_name);
        setEditingName(true);
    };

    const handleSaveName = async () => {
        if (tempName() && tempName() !== props.actor.display_name) {
            await props.operations.updateDisplayName(props.actor.id, tempName(), props.actor.display_name);
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
        await props.operations.updateActor(props.actor.id, { actor_complete: newStatus });
    };

    return (
        <Box>
            <DetailHeader
                title={props.actor.display_name}
                subtitle={`Actor ID: ${props.actor.id}`}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
                deleteDisabled={props.operations.deleting && props.operations.deleting()}
                rightActions={
                    <CompleteButton
                        isComplete={props.actor.actor_complete}
                        onToggle={handleToggleComplete}
                        itemType="actor"
                        isFinalActor={isFinalActor()}
                    />
                }
            />

            {/* Inline Name Edit */}
            <Show when={editingName()}>
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>Rename Actor</Typography>
                    <Stack direction="row" spacing={1}>
                        <TextField
                            size="small"
                            fullWidth
                            value={tempName()}
                            onChange={(e) => setTempName(e.target.value)}
                            autoFocus
                        />
                        <Button variant="contained" onClick={handleSaveName}>Save</Button>
                        <Button onClick={handleCancelEdit}>Cancel</Button>
                    </Stack>
                </Box>
            </Show>

            <Stack spacing={3}>
                {/* Base Filename (Read-only/Edit could be added here if needed, but not in original summary) */}
                <Box>
                    <Typography variant="overline" color="text.secondary">
                        Base Filename
                    </Typography>
                    <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {props.actor.base_filename || props.actor.voice_id || 'Not set'}
                    </Typography>
                </Box>

                {/* Provider Settings (Defaults) */}
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                    <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2">Default Voice Settings (Dialogue)</Typography>
                    </Box>
                    <Box sx={{ p: 2 }}>
                        <ProviderSettingsEditor
                            contentType="dialogue"
                            settings={props.actor.provider_settings?.dialogue}
                            voices={props.operations.voices()}
                            loadingVoices={props.operations.loadingVoices()}
                            allowInherit={true}
                            onSettingsChange={(settings) => {
                                const current = props.actor.provider_settings || {};
                                props.operations.updateActor(props.actor.id, {
                                    provider_settings: { ...current, dialogue: settings }
                                });
                            }}
                        />
                    </Box>
                </Box>

                {/* Section Management */}
                <SectionManagement
                    actor={props.actor}
                    sections={props.sections}
                    onCreateSection={props.operations.createSection}
                    creatingContent={props.operations.creatingContent()}
                />
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
