import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import { Box, Typography, Button, TextField, List, ListItemButton, ListItemText, Paper, Divider } from '@suid/material';
import FolderOpenIcon from '@suid/icons-material/FolderOpen';
import AddIcon from '@suid/icons-material/Add';
import { getProjects, createProject, switchProject } from '../api/client.js';

export default function WelcomeScreen(props) {
    const [projects, setProjects] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [newProjectName, setNewProjectName] = createSignal('');
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    // Load available projects
    onMount(async () => {
        try {
            setLoading(true);
            const data = await getProjects();
            setProjects(data.projects || []);
        } catch (err) {
            console.error('Failed to load projects:', err);
            setError('Failed to load projects');
        } finally {
            setLoading(false);
        }
    });

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

    return (
        <Box
            component="main"
            sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    p: 4,
                    maxWidth: 500,
                    width: '100%',
                    textAlign: 'center',
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ fontSize: '4rem' }}>🐮</Box>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        MOO
                    </Typography>
                    <Typography variant="h6" color="text.secondary">
                        Media Output Organizer
                    </Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Select an existing project or create a new one to get started.
                </Typography>

                <Show when={error()}>
                    <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                        {error()}
                    </Typography>
                </Show>

                {/* Existing Projects */}
                <Show when={!loading() && projects().length > 0}>
                    <Typography variant="subtitle2" sx={{ textAlign: 'left', mb: 1 }}>
                        Recent Projects
                    </Typography>
                    <List sx={{ mb: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <For each={projects()}>
                            {(project) => (
                                <ListItemButton
                                    onClick={() => handleSelectProject(project)}
                                >
                                    <FolderOpenIcon sx={{ mr: 2, color: 'primary.main' }} />
                                    <ListItemText
                                        primary={project.displayName || project.name}
                                        secondary={project.path}
                                    />
                                </ListItemButton>
                            )}
                        </For>
                    </List>
                </Show>

                <Show when={loading()}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Loading projects...
                    </Typography>
                </Show>

                <Divider sx={{ my: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        OR
                    </Typography>
                </Divider>

                {/* Create New Project */}
                <Typography variant="subtitle2" sx={{ textAlign: 'left', mb: 1 }}>
                    Create New Project
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Project name"
                        value={newProjectName()}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={creating()}
                    />
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleCreateProject}
                        disabled={!newProjectName().trim() || creating()}
                    >
                        Create
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
}
