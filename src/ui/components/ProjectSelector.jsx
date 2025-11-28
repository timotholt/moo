import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FolderIcon from '@mui/icons-material/Folder';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { getProjects, createProject, deleteProject, copyProject, switchProject } from '../api/client.js';

const LAST_PROJECT_KEY = 'audiomanager-last-project';

export default function ProjectSelector({ currentProject, onProjectChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Dialog states
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [copySourceProject, setCopySourceProject] = useState(null);
  const [copyNewName, setCopyNewName] = useState('');

  const open = Boolean(anchorEl);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProjects();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Auto-open last project on mount
  useEffect(() => {
    const autoOpenProject = async () => {
      if (!currentProject && projects.length > 0) {
        const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
        const projectToOpen = lastProject 
          ? projects.find(p => p.name === lastProject) 
          : projects[0];
        
        if (projectToOpen) {
          try {
            const result = await switchProject(projectToOpen.name);
            if (onProjectChange) {
              onProjectChange(result.project);
              localStorage.setItem(LAST_PROJECT_KEY, projectToOpen.name);
            }
          } catch (err) {
            console.error('Failed to auto-open project:', err);
          }
        }
      }
    };
    autoOpenProject();
  }, [projects, currentProject, onProjectChange]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    loadProjects(); // Refresh list when opening
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectProject = async (project) => {
    try {
      setLoading(true);
      // Tell server to switch projects
      const result = await switchProject(project.name);
      if (onProjectChange) {
        onProjectChange(result.project);
        localStorage.setItem(LAST_PROJECT_KEY, project.name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    try {
      setLoading(true);
      const result = await createProject(newProjectName.trim());
      await loadProjects();
      setNewDialogOpen(false);
      setNewProjectName('');
      
      // Auto-select the new project
      if (result.project && onProjectChange) {
        onProjectChange(result.project);
        localStorage.setItem(LAST_PROJECT_KEY, result.project.name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      setLoading(true);
      await deleteProject(projectToDelete.name);
      await loadProjects();
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
      
      // If we deleted the current project, clear selection
      if (currentProject?.name === projectToDelete.name && onProjectChange) {
        onProjectChange(null);
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyProject = async () => {
    if (!copySourceProject || !copyNewName.trim()) return;
    
    try {
      setLoading(true);
      const result = await copyProject(copySourceProject.name, copyNewName.trim());
      await loadProjects();
      setCopyDialogOpen(false);
      setCopySourceProject(null);
      setCopyNewName('');
      
      // Auto-select the copied project
      if (result.project && onProjectChange) {
        onProjectChange(result.project);
        localStorage.setItem(LAST_PROJECT_KEY, result.project.name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDialog = (project, e) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
    handleClose();
  };

  const openCopyDialog = (project, e) => {
    e.stopPropagation();
    setCopySourceProject(project);
    setCopyNewName(project.name + '-copy');
    setCopyDialogOpen(true);
    handleClose();
  };

  return (
    <>
      <Button
        onClick={handleClick}
        endIcon={<KeyboardArrowDownIcon />}
        sx={{ 
          color: 'inherit', 
          textTransform: 'none',
          minWidth: 150,
        }}
      >
        <FolderIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
        {currentProject?.displayName || currentProject?.name || 'No Project'}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 250, maxHeight: 400 }
        }}
      >
        {/* New Project */}
        <MenuItem onClick={() => { setNewDialogOpen(true); handleClose(); }}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New Project</ListItemText>
        </MenuItem>
        
        <Divider />
        
        {/* Project List */}
        {loading && (
          <MenuItem disabled>
            <ListItemText>Loading...</ListItemText>
          </MenuItem>
        )}
        
        {!loading && projects.length === 0 && (
          <MenuItem disabled>
            <ListItemText>No projects yet</ListItemText>
          </MenuItem>
        )}
        
        {projects.map((project) => (
          <MenuItem 
            key={project.name}
            selected={currentProject?.name === project.name}
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              '&:hover .project-actions': { opacity: 1 }
            }}
          >
            <Box 
              sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}
              onClick={() => handleSelectProject(project)}
            >
              <FolderIcon sx={{ mr: 1, fontSize: '1rem', color: 'text.secondary' }} />
              <ListItemText 
                primary={project.name}
                primaryTypographyProps={{ fontSize: '0.9rem' }}
              />
            </Box>
            <Box 
              className="project-actions"
              sx={{ 
                opacity: 0, 
                transition: 'opacity 0.2s',
                display: 'flex',
                gap: 0.5
              }}
            >
              <ContentCopyIcon 
                fontSize="small" 
                sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                onClick={(e) => openCopyDialog(project, e)}
              />
              <DeleteIcon 
                fontSize="small" 
                sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                onClick={(e) => openDeleteDialog(project, e)}
              />
            </Box>
          </MenuItem>
        ))}
        
        {error && (
          <>
            <Divider />
            <MenuItem disabled>
              <Typography color="error" variant="caption">{error}</Typography>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* New Project Dialog */}
      <Dialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)}>
        <DialogTitle>New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateProject} variant="contained" disabled={!newProjectName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{projectToDelete?.name}"? 
            This will permanently delete all actors, content, and media files.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteProject} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy/Save As Dialog */}
      <Dialog open={copyDialogOpen} onClose={() => setCopyDialogOpen(false)}>
        <DialogTitle>Save Project As</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Create a copy of "{copySourceProject?.name}" with a new name:
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="New Project Name"
            fullWidth
            value={copyNewName}
            onChange={(e) => setCopyNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCopyProject()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCopyProject} variant="contained" disabled={!copyNewName.trim()}>
            Save As
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
