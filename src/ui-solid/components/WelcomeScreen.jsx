import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import { Box, Typography, Button, List, ListItemButton, Paper, Divider, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@suid/material';
import FolderOpenIcon from '@suid/icons-material/FolderOpen';
import DeleteIcon from '@suid/icons-material/Delete';
import { getProjects, createProject, switchProject, deleteProject } from '../api/client.js';
import TextInput from './TextInput.jsx';
import { storage } from '../utils/storage.js';

export default function WelcomeScreen(props) {
    const [projects, setProjects] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [newProjectName, setNewProjectName] = createSignal('');
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    // Delete confirmation state
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
    const [projectToDelete, setProjectToDelete] = createSignal(null);
    const [deleteConfirmName, setDeleteConfirmName] = createSignal('');
    const [deleting, setDeleting] = createSignal(false);

    // Load available projects
    onMount(async () => {
        await loadProjects();
    });

    const loadProjects = async () => {
        try {
            setLoading(true);
            const data = await getProjects();
            // Sort by most recent first (updatedAt descending)
            const sorted = (data.projects || []).sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
            });
            setProjects(sorted);
        } catch (err) {
            console.error('Failed to load projects:', err);
            setError('Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProject = async (project) => {
        try {
            setError(null);
            await switchProject(project.name);
            // Save to localStorage for next session
            localStorage.setItem('moo-last-project', project.name);
            props.onProjectChange(project);
        } catch (err) {
            setError(`Failed to open project: ${err.message}`);
        }
    };

    const handleCreateProject = async () => {
        if (!newProjectName().trim()) return;

        try {
            setCreating(true);
            setError(null);
            const data = await createProject(newProjectName().trim());
            if (data.project) {
                // Switch to the new project
                await switchProject(data.project.name);
                localStorage.setItem('moo-last-project', data.project.name);
                props.onProjectChange(data.project);
            }
        } catch (err) {
            setError(`Failed to create project: ${err.message}`);
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleCreateProject();
    };

    const openDeleteDialog = (project, e) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setDeleteConfirmName('');
        setDeleteDialogOpen(true);
    };

    const handleDeleteProject = async () => {
        const project = projectToDelete();
        if (!project || deleteConfirmName() !== project.name) return;

        try {
            setDeleting(true);
            setError(null);
            await deleteProject(project.name);
            // Clear all project-scoped metadata from localStorage
            storage.clearProject(project.name);
            await loadProjects();
            setDeleteDialogOpen(false);
            setProjectToDelete(null);
            setDeleteConfirmName('');
        } catch (err) {
            setError(`Failed to delete project: ${err.message}`);
        } finally {
            setDeleting(false);
        }
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return { date: '', time: '' };
        const d = new Date(dateString);
        const date = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const time = d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return { date, time };
    };

    return (
        <Box
            component="main"
            sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    p: 2.5,
                    maxWidth: 600,
                    width: '100%',
                    maxHeight: '70vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header - Horizontal Layout */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                    <Box sx={{ fontSize: '3rem', lineHeight: 1, height: '3rem', display: 'flex', alignItems: 'center' }}>🐮</Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '3rem' }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1, mb: 0.5 }}>
                            MOO
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: '0.7rem', lineHeight: 1 }} color="text.secondary">
                            Media Organizer of Organizers
                        </Typography>
                    </Box>
                </Box>

                <Show when={error()}>
                    <Typography color="error" variant="caption" sx={{ mb: 1, textAlign: 'center', fontSize: '0.75rem' }}>
                        {error()}
                    </Typography>
                </Show>

                {/* Existing Projects */}
                <Show when={!loading() && projects().length > 0}>
                    <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', textAlign: 'left', mb: 0.5, color: 'text.secondary' }}>
                        Recent Projects ({projects().length})
                    </Typography>
                    <Box sx={{
                        mb: 1.5,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        maxHeight: '30vh',
                        overflowY: 'auto',
                        '&::-webkit-scrollbar': { width: '8px' },
                        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                        '&::-webkit-scrollbar-thumb': {
                            bgcolor: 'rgba(255,255,255,0.15)',
                            borderRadius: 4,
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                        }
                    }}>
                        <List sx={{ py: 0.5 }}>
                            <For each={projects()}>
                                {(project) => {
                                    const dt = formatDateTime(project.updatedAt);
                                    return (
                                        <ListItemButton
                                            onClick={() => handleSelectProject(project)}
                                            sx={{
                                                py: 0.75,
                                                px: 1.5,
                                                borderRadius: 0.5,
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                '&:hover .delete-button': { color: 'error.main' }
                                            }}
                                        >
                                            <FolderOpenIcon sx={{ mr: 1.5, mt: 0.25, fontSize: '1.1rem', color: 'primary.main', flexShrink: 0 }} />
                                            <Box sx={{ flexGrow: 1, minWidth: 0, mr: 2 }}>
                                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.3 }}>
                                                    {project.displayName || project.name}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.2, mt: 0.25 }} noWrap>
                                                    {project.path}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', mr: 1, flexShrink: 0 }}>
                                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.primary', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                                                    {dt.date}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'nowrap', lineHeight: 1.2, mt: 0.25 }}>
                                                    {dt.time}
                                                </Typography>
                                            </Box>
                                            <IconButton
                                                className="delete-button"
                                                size="small"
                                                onClick={(e) => openDeleteDialog(project, e)}
                                                sx={{
                                                    p: 0.5,
                                                    color: 'text.disabled',
                                                    transition: 'color 0.2s',
                                                    '&:hover': { color: 'error.main' }
                                                }}
                                                title="Delete Project"
                                            >
                                                <DeleteIcon sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                        </ListItemButton>
                                    );
                                }}
                            </For>
                        </List>
                    </Box>
                </Show>

                <Show when={loading()}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', mb: 1.5, textAlign: 'center' }} color="text.secondary">
                        Loading projects...
                    </Typography>
                </Show>

                <Show when={!loading() && projects().length > 0}>
                    <Divider sx={{ my: 1 }}>
                        <Typography variant="caption" sx={{ fontSize: '0.65rem' }} color="text.secondary">
                            OR
                        </Typography>
                    </Divider>
                </Show>

                {/* Create New Project */}
                <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', textAlign: 'left', mb: 0.5, color: 'text.secondary' }}>
                    Create New Project
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextInput
                        fullWidth
                        size="small"
                        placeholder="Project name"
                        value={newProjectName()}
                        onValueChange={setNewProjectName}
                        onKeyDown={handleKeyDown}
                        disabled={creating()}
                        sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleCreateProject}
                        disabled={!newProjectName().trim() || creating()}
                        sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap', px: 3 }}
                    >
                        Create
                    </Button>
                </Box>
            </Paper>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen()}
                onClose={() => !deleting() && setDeleteDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Delete Project</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Are you sure you want to delete <strong>"{projectToDelete()?.name}"</strong>?
                    </Typography>
                    <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                        This will permanently delete all actors, sections, content, and media files.
                        This action cannot be undone.
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                        Type the project name to confirm:
                    </Typography>
                    <TextInput
                        fullWidth
                        size="small"
                        placeholder={projectToDelete()?.name}
                        value={deleteConfirmName()}
                        onValueChange={setDeleteConfirmName}
                        disabled={deleting()}
                        autoFocus
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting()}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteProject}
                        color="error"
                        variant="contained"
                        disabled={deleteConfirmName() !== projectToDelete()?.name || deleting()}
                    >
                        {deleting() ? 'Deleting...' : 'Delete Project'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
