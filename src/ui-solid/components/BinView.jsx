import { createSignal, createMemo, Show } from 'solid-js';
import {
    Box, Typography, Stack, Button,
    Paper, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions
} from '@suid/material';
import TextInput from './TextInput.jsx';
import DetailHeader from './DetailHeader.jsx';
import CompleteButton from './CompleteButton.jsx';
import DefaultBlockManager from './DefaultBlockManager.jsx';
import AddIcon from '@suid/icons-material/Add';

export default function BinView(props) {
    // props: binData, owner, mediaType, operations, projectDefaults

    const [editingName, setEditingName] = createSignal(false);
    const [tempName, setTempName] = createSignal('');
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);

    const [mediaPrompt, setMediaPrompt] = createSignal('');
    const [mediaName, setMediaName] = createSignal('');

    const handleStartEdit = () => {
        setTempName(props.binData.name || props.binData.media_type);
        setEditingName(true);
    };

    const handleSaveName = async () => {
        if (tempName() && tempName() !== props.binData.name) {
            await props.operations.updateBinName(props.binData.id, tempName(), props.binData.name);
        }
        setEditingName(false);
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        setDeleteDialogOpen(false);
        if (props.operations.deleteBin) {
            await props.operations.deleteBin(props.binData.id);
        }
    };

    const handleToggleComplete = async () => {
        const newStatus = !props.binData.bin_complete;
        await props.operations.toggleBinComplete(props.binData.id, newStatus);
    };

    const parsedNames = createMemo(() => {
        return mediaName().split(',').map(s => s.trim()).filter(s => s.length > 0);
    });

    const handleCreateMedia = async (e) => {
        if (e) e.preventDefault();
        const names = parsedNames();
        if (names.length === 0) return;

        for (const name of names) {
            props.operations.setMediaName(name);
            props.operations.setMediaPrompt(mediaPrompt());
            await props.operations.createMedia(
                props.binData.owner_id,
                props.binData.owner_type,
                props.mediaType,
                props.binData.id
            );
        }
        setMediaName('');
        setMediaPrompt('');
    };

    return (
        <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
            <DetailHeader
                title={props.binData.name || `${props.mediaType} Bin`}
                subtitle={`Bin ID: ${props.binData.id}`}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
                isEditing={editingName()}
                editValue={tempName()}
                onEditChange={setTempName}
                onEditSave={handleSaveName}
                onEditCancel={() => setEditingName(false)}
                rightActions={
                    <CompleteButton
                        isComplete={props.binData.bin_complete}
                        onToggle={handleToggleComplete}
                        itemType="bin"
                    />
                }
            />

            <Stack spacing={4} sx={{ mt: 2 }}>
                <Box>
                    <Typography variant="overline" color="text.secondary">Parent {props.binData.owner_type}</Typography>
                    <Typography variant="body1">
                        {props.owner ? (props.owner.display_name || props.owner.name) : 'Global'}
                    </Typography>
                </Box>

                <DefaultBlockManager
                    owner={props.binData}
                    ownerType="bin"
                    parent={props.owner}
                    projectDefaults={props.projectDefaults}
                    voices={props.operations.voices()}
                    loadingVoices={props.operations.loadingVoices()}
                    onUpdate={(newBlocks) => {
                        props.operations.updateBinField(props.binData.id, {
                            default_blocks: newBlocks
                        });
                    }}
                />

                <Paper variant="outlined" sx={{ p: 3, borderRadius: '8px', border: '2px solid', borderColor: 'primary.light', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'primary.main' }}>
                        Quick Add {props.mediaType} Media
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                        Enter names (comma-separated) to batch create multiple items for this bin.
                    </Typography>
                    <Stack spacing={2}>
                        <TextInput
                            label="Media Name(s)"
                            placeholder="e.g. CLIP_001, CLIP_002, CLIP_003"
                            size="small"
                            fullWidth
                            value={mediaName()}
                            onValueChange={setMediaName}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateMedia()}
                        />
                        <TextInput
                            label="Shared Prompt/Text (Optional)"
                            size="small"
                            fullWidth
                            multiline
                            rows={2}
                            value={mediaPrompt()}
                            onValueChange={setMediaPrompt}
                        />
                        <Button
                            variant="contained"
                            onClick={handleCreateMedia}
                            disabled={props.operations.creatingMedia() || parsedNames().length === 0}
                            startIcon={props.operations.creatingMedia() ? undefined : <AddIcon />}
                        >
                            {props.operations.creatingMedia() ? 'Creating...' : `Add Media${parsedNames().length > 1 ? `s (${parsedNames().length})` : ''}`}
                        </Button>
                    </Stack>
                </Paper>
            </Stack>

            <Dialog
                open={deleteDialogOpen()}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Delete Bin?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this bin?
                        This will delete all media and takes within this bin.
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
