import { createSignal, createMemo, Show } from 'solid-js';
import {
    Box, Typography, TextField, Stack, Button,
    Paper, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions
} from '@suid/material';
import ExpandMore from '@suid/icons-material/ExpandMore';
import ExpandLess from '@suid/icons-material/ExpandLess';
import Collapse from './Collapse.jsx';
import DetailHeader from './DetailHeader.jsx';
import CompleteButton from './CompleteButton.jsx';
import ProviderSettingsEditor from './ProviderSettingsEditor.jsx';
import AddIcon from '@suid/icons-material/Add';

export default function SectionView(props) {
    // props: sectionData, owner, contentType, operations (useDataOperations result)

    const [editingName, setEditingName] = createSignal(false);
    const [tempName, setTempName] = createSignal('');
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
    const [settingsExpanded, setSettingsExpanded] = createSignal(false);

    // Content creation state
    const [contentPrompt, setContentPrompt] = createSignal('');
    const [contentName, setContentName] = createSignal('');

    const handleStartEdit = () => {
        setTempName(props.sectionData.name || props.sectionData.content_type);
        setEditingName(true);
    };

    const handleSaveName = async () => {
        if (tempName() && tempName() !== props.sectionData.name) {
            await props.operations.updateSectionName(props.sectionData.id, tempName(), props.sectionData.name);
        }
        setEditingName(false);
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        setDeleteDialogOpen(false);
        if (props.operations.deleteSection) {
            await props.operations.deleteSection(props.sectionData.id);
        }
    };

    const handleToggleComplete = async () => {
        const newStatus = !props.sectionData.section_complete;
        await props.operations.toggleSectionComplete(props.sectionData.id, newStatus);
    };

    const parsedNames = createMemo(() => {
        return contentName().split(',').map(s => s.trim()).filter(s => s.length > 0);
    });

    const handleCreateContent = async (e) => {
        if (e) e.preventDefault();
        const names = parsedNames();
        if (names.length === 0) return;

        for (const name of names) {
            props.operations.setContentName(name);
            props.operations.setContentPrompt(contentPrompt());
            await props.operations.createContent(
                props.sectionData.owner_id,
                props.sectionData.owner_type,
                props.contentType,
                props.sectionData.id
            );
        }

        // Clear local form
        setContentName('');
        setContentPrompt('');
    };

    return (
        <Box>
            <DetailHeader
                title={props.sectionData.name || `${props.contentType} Section`}
                subtitle={`Section ID: ${props.sectionData.id}`}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
                rightActions={
                    <CompleteButton
                        isComplete={props.sectionData.section_complete}
                        onToggle={handleToggleComplete}
                        itemType="section"
                    />
                }
            />

            <Show when={editingName()}>
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>Rename Section</Typography>
                    <Stack direction="row" spacing={1}>
                        <TextField
                            size="small"
                            fullWidth on:input={(e) => setTempName(e.target.value)}
                            autoFocus
                        />
                        <Button variant="contained" onClick={handleSaveName}>Save</Button>
                        <Button onClick={() => setEditingName(false)}>Cancel</Button>
                    </Stack>
                </Box>
            </Show>

            <Stack spacing={3}>
                {/* Parent Owner Link */}
                <Box>
                    <Typography variant="overline" color="text.secondary">Parent {props.sectionData.owner_type}</Typography>
                    <Typography variant="body1">
                        {props.owner ? (props.owner.display_name || props.owner.name) : 'Global'}
                    </Typography>
                </Box>

                {/* Collapsible Provider Settings */}
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            p: 2,
                            cursor: 'pointer',
                            bgcolor: 'action.hover'
                        }}
                        onClick={() => setSettingsExpanded(!settingsExpanded())}
                    >
                        <Typography variant="subtitle2">Provider Settings</Typography>
                        {settingsExpanded() ? <ExpandMore /> : <ExpandLess />}
                    </Stack>
                    <Collapse in={settingsExpanded()}>
                        <Box sx={{ p: 2 }}>
                            <ProviderSettingsEditor
                                contentType={props.contentType}
                                settings={props.sectionData.default_blocks?.[props.contentType]}
                                voices={props.operations.voices()}
                                loadingVoices={props.operations.loadingVoices()}
                                allowInherit={true}
                                onSettingsChange={(settings) => props.operations.updateProviderSettings(props.sectionData.id, props.contentType, settings)}
                                error={props.operations.error()}
                            />
                        </Box>
                    </Collapse>
                </Paper>

                {/* Add Content Form */}
                <Paper variant="outlined" sx={{ p: 2, border: '1px solid', borderColor: 'primary.light' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>Quick Add {props.contentType} Content</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                        Enter names separated by commas to batch create multiple items.
                    </Typography>
                    <Stack spacing={2}>
                        <TextField
                            label="Content Name(s)"
                            placeholder="e.g. CUE_001, CUE_002, CUE_003"
                            size="small"
                            fullWidth on:input={(e) => setContentName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateContent()}
                        />
                        <TextField
                            label="Shared Prompt/Text (Optional)"
                            size="small"
                            fullWidth
                            multiline
                            rows={2} on:input={(e) => setContentPrompt(e.target.value)}
                        />
                        <Button
                            variant="contained"
                            onClick={handleCreateContent}
                            disabled={props.operations.creatingContent() || parsedNames().length === 0}
                            startIcon={props.operations.creatingContent() ? undefined : <AddIcon />}
                        >
                            {props.operations.creatingContent() ? 'Creating...' : `Add Content${parsedNames().length > 1 ? `s (${parsedNames().length})` : ''}`}
                        </Button>
                    </Stack>
                </Paper>
            </Stack>

            <Dialog
                open={deleteDialogOpen()}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Delete Section?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this section?
                        This will delete all content and takes within this section.
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
