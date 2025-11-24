import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Slider from '@mui/material/Slider';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import { createActor, createContent, createSection, deleteActor, deleteContent, getVoices, updateActor, updateSection } from '../api/client.js';

export default function DetailPane({ actors, content, sections, selectedNode, onActorCreated, onContentCreated, onActorDeleted, onContentDeleted, onSectionCreated, onActorUpdated, onSectionUpdated }) {
  const [actorName, setActorName] = useState('');
  const [creatingActor, setCreatingActor] = useState(false);
  const [contentPrompt, setContentPrompt] = useState('');
  const [contentItemId, setContentItemId] = useState('');
  const [creatingContent, setCreatingContent] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDeleteActorOpen, setConfirmDeleteActorOpen] = useState(false);
  const [confirmDeleteContentOpen, setConfirmDeleteContentOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Enhanced actor creation state
  const [showAdvancedActorForm, setShowAdvancedActorForm] = useState(false);
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [actorProviders, setActorProviders] = useState({
    dialogue: { provider: 'elevenlabs', voice_id: '', batch_generate: 1, approval_count_default: 1, stability: 0.5, similarity_boost: 0.75 },
    music: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
    sfx: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 }
  });

  // Section name editing state
  const [editingSectionName, setEditingSectionName] = useState(false);
  const [sectionName, setSectionName] = useState('');
  
  // Provider settings collapse state
  const [providerSettingsExpanded, setProviderSettingsExpanded] = useState(false);
  
  // Base filename editing state
  const [editingBaseFilename, setEditingBaseFilename] = useState(false);
  const [baseFilename, setBaseFilename] = useState('');

  const handleCreateActor = async () => {
    try {
      setCreatingActor(true);
      setError(null);
      const result = await createActor({ display_name: actorName || 'New Actor' });
      if (result && result.actor && onActorCreated) {
        onActorCreated(result.actor);
      }
      setActorName('');
      // For now, ask user to refresh; later we can reload actors automatically.
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingActor(false);
    }
  };

  const handleCreateActorWithProviders = async () => {
    try {
      setCreatingActor(true);
      setError(null);
      const result = await createActor({ 
        display_name: actorName || 'New Actor',
        provider_settings: actorProviders
      });
      if (result && result.actor && onActorCreated) {
        onActorCreated(result.actor);
      }
      setActorName('');
      setShowAdvancedActorForm(false);
      // Reset provider settings to defaults
      setActorProviders({
        dialogue: { provider: 'elevenlabs', voice_id: '', batch_generate: 1, approval_count_default: 1, stability: 0.5, similarity_boost: 0.75 },
        music: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
        sfx: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 }
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingActor(false);
    }
  };

  const loadVoices = async () => {
    try {
      setLoadingVoices(true);
      setError(null); // Clear any previous errors
      const result = await getVoices();
      setVoices(result.voices || []);
      if (!result.voices || result.voices.length === 0) {
        setError('No voices available from ElevenLabs');
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
      let errorMessage = err.message || String(err);
      
      // Check for specific ElevenLabs permission errors
      if (errorMessage.includes('missing_permissions') || errorMessage.includes('voices_read')) {
        errorMessage = 'ElevenLabs API key is missing voices_read permission. Please check your API key permissions in the ElevenLabs dashboard.';
      } else if (errorMessage.includes('Failed to fetch voices')) {
        errorMessage = 'Cannot connect to ElevenLabs API. Check your internet connection and API key configuration.';
      }
      
      setError(`Failed to load voices: ${errorMessage}`);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleShowAdvancedForm = () => {
    setShowAdvancedActorForm(true);
    if (voices.length === 0) {
      loadVoices();
    }
  };

  // Auto-load voices when section opens and provider is elevenlabs
  React.useEffect(() => {
    if (selectedNode?.type?.endsWith('-section')) {
      const contentType = selectedNode.type.replace('-section', '');
      const actor = actors.find((a) => a.id === selectedNode.id);
      const providerSettings = actor?.provider_settings?.[contentType];
      
      if (providerSettings?.provider === 'elevenlabs' && voices.length === 0 && !loadingVoices) {
        loadVoices();
      }
    }
  }, [selectedNode, actors, voices.length, loadingVoices]);

  const handleCreateContent = async (actorId, contentType) => {
    try {
      setCreatingContent(true);
      setError(null);
      const result = await createContent({
        actor_id: actorId,
        content_type: contentType,
        item_id: contentItemId,
        prompt: contentPrompt || '',
      });
      if (result && result.content && onContentCreated) {
        // Handle both single and batch creation
        if (Array.isArray(result.content)) {
          result.content.forEach(item => onContentCreated(item));
        } else {
          onContentCreated(result.content);
        }
        
        // Show message about duplicates if any were skipped
        if (result.message) {
          setError(result.message);
        }
      }
      setContentPrompt('');
      setContentItemId('');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingContent(false);
    }
  };

  const handleCreateSection = async (actorId, contentType, customName = null) => {
    try {
      setCreatingContent(true);
      setError(null);
      
      const sectionData = {
        actor_id: actorId,
        content_type: contentType,
      };
      
      if (customName) {
        sectionData.name = customName;
      }
      
      const result = await createSection(sectionData);
      
      if (result && result.section && onSectionCreated) {
        onSectionCreated(result.section);
      }
      
      console.log(`Created ${contentType} section for actor ${actorId}`);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingContent(false);
    }
  };

  const updateActorProviderSettings = async (actorId, contentType, newSettings) => {
    try {
      const actor = actors.find(a => a.id === actorId);
      if (!actor) return;

      const updatedProviderSettings = {
        ...actor.provider_settings,
        [contentType]: {
          ...actor.provider_settings?.[contentType],
          ...newSettings
        }
      };

      const result = await updateActor(actorId, {
        provider_settings: updatedProviderSettings
      });

      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const updateSectionName = async (sectionId, newName) => {
    try {
      const result = await updateSection(sectionId, { name: newName });
      if (result && result.section && onSectionUpdated) {
        onSectionUpdated(result.section);
      }
      setEditingSectionName(false);
      setSectionName('');
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const updateActorBaseFilename = async (actorId, newBaseFilename) => {
    try {
      const result = await updateActor(actorId, { base_filename: newBaseFilename });
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
      setEditingBaseFilename(false);
      setBaseFilename('');
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  if (!selectedNode) {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography variant="body1" gutterBottom>
          Select an actor or content item from the tree, or create a new actor below.
        </Typography>
        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Add new actor
          </Typography>
          <Stack spacing={1} direction="row" sx={{ maxWidth: 480 }}>
            <TextField
              label="Actor display name"
              size="small"
              fullWidth
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
            />
            <Button
              variant="contained"
              size="small"
              disabled={creatingActor || !actorName.trim()}
              onClick={handleCreateActor}
            >
              {creatingActor ? 'Creating…' : 'Add Actor'}
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  if (selectedNode.type === 'actor') {
    const actor = actors.find((a) => a.id === selectedNode.id);
    if (!actor) {
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="error">Actor not found.</Typography>
        </Box>
      );
    }

    const handleConfirmDeleteActor = async () => {
      try {
        setDeleting(true);
        setError(null);
        await deleteActor(actor.id);
        if (onActorDeleted) onActorDeleted(actor.id);
        setConfirmDeleteActorOpen(false);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setDeleting(false);
      }
    };

    const hasDialogue = sections.some(s => s.actor_id === actor.id && s.content_type === 'dialogue');
    const hasMusic = sections.some(s => s.actor_id === actor.id && s.content_type === 'music');
    const hasSfx = sections.some(s => s.actor_id === actor.id && s.content_type === 'sfx');

    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ flexGrow: 1, fontSize: '1.1rem' }}>
            {actor.display_name}
          </Typography>
          <IconButton
            size="small"
            color="error"
            aria-label="Delete actor"
            onClick={() => setConfirmDeleteActorOpen(true)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
        
        {/* Editable Base Filename */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {editingBaseFilename ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Base filename:</Typography>
              <TextField
                size="small"
                value={baseFilename}
                onChange={(e) => setBaseFilename(e.target.value)}
                placeholder={actor.base_filename}
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    updateActorBaseFilename(actor.id, baseFilename || actor.base_filename);
                  }
                }}
                sx={{ fontSize: '0.8rem' }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={() => updateActorBaseFilename(actor.id, baseFilename || actor.base_filename)}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setEditingBaseFilename(false);
                  setBaseFilename('');
                }}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                Base filename: {actor.base_filename}
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setEditingBaseFilename(true);
                  setBaseFilename(actor.base_filename);
                }}
                sx={{ fontSize: '0.7rem' }}
              >
                Edit
              </Button>
            </Box>
          )}
        </Box>
        <Typography variant="body2" gutterBottom sx={{ fontSize: '0.8rem' }}>
          Aliases: {actor.aliases && actor.aliases.length ? actor.aliases.join(', ') : '—'}
        </Typography>

        {/* Provider Settings */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.95rem' }}>
            Provider Settings
          </Typography>
          
          {/* Dialogue Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="body2" gutterBottom sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
              Dialogue
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Provider: {actor.provider_settings?.dialogue?.provider || 'manual'}
              {actor.provider_settings?.dialogue?.voice_id && (
                <> • Voice ID: {actor.provider_settings.dialogue.voice_id}</>
              )}
            </Typography>
            {actor.provider_settings?.dialogue?.provider === 'elevenlabs' && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                Batch: {actor.provider_settings.dialogue.batch_generate || 1} • 
                Approval: {actor.provider_settings.dialogue.approval_count_default || 1} • 
                Stability: {actor.provider_settings.dialogue.stability || 0.5} • 
                Similarity: {actor.provider_settings.dialogue.similarity_boost || 0.75}
              </Typography>
            )}
          </Box>

          {/* Music Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="body2" gutterBottom sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
              Music
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Provider: {actor.provider_settings?.music?.provider || 'manual'}
              {actor.provider_settings?.music?.provider === 'elevenlabs' && (
                <> • Batch: {actor.provider_settings.music.batch_generate || 1} • 
                Approval: {actor.provider_settings.music.approval_count_default || 1}</>
              )}
            </Typography>
          </Box>

          {/* SFX Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="body2" gutterBottom sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
              SFX
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Provider: {actor.provider_settings?.sfx?.provider || 'manual'}
              {actor.provider_settings?.sfx?.provider === 'elevenlabs' && (
                <> • Batch: {actor.provider_settings.sfx.batch_generate || 1} • 
                Approval: {actor.provider_settings.sfx.approval_count_default || 1}</>
              )}
            </Typography>
          </Box>
        </Box>

        {/* Content Sections Management */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.95rem' }}>
            Content Sections
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.8rem' }}>
            Create multiple sections for different types of content (e.g., Combat Dialog, Story Music, etc.)
          </Typography>
          
          <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Show existing sections categorized by type */}
            {['dialogue', 'music', 'sfx'].map(contentType => {
              const sectionsOfType = sections.filter(s => s.actor_id === actor.id && s.content_type === contentType);
              if (sectionsOfType.length === 0) return null;
              
              return (
                <Box key={contentType}>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>
                    {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Sections:
                  </Typography>
                  {sectionsOfType.map(section => (
                    <Box key={section.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 2 }}>
                      <Typography variant="body2" sx={{ minWidth: 120, fontSize: '0.8rem' }}>
                        {section.name || section.content_type.toUpperCase()}
                      </Typography>
                      <Typography variant="body2" color="success.main" sx={{ fontSize: '0.8rem' }}>
                        ✓ Section exists
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
            
            {/* Add new section buttons */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCreateSection(actor.id, 'dialogue')}
                disabled={creatingContent}
                sx={{ fontSize: '0.75rem' }}
              >
                + Add Dialogue Section
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCreateSection(actor.id, 'music')}
                disabled={creatingContent}
                sx={{ fontSize: '0.75rem' }}
              >
                + Add Music Section
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCreateSection(actor.id, 'sfx')}
                disabled={creatingContent}
                sx={{ fontSize: '0.75rem' }}
              >
                + Add SFX Section
              </Button>
            </Box>
          </Stack>
        </Box>

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}

        <Dialog
          open={confirmDeleteActorOpen}
          onClose={() => {
            if (!deleting) setConfirmDeleteActorOpen(false);
          }}
        >
          <DialogTitle>Delete actor?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              This will remove this actor and all of their content and takes. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteActorOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="error" onClick={handleConfirmDeleteActor} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  if (selectedNode.type === 'content') {
    const item = content.find((c) => c.id === selectedNode.id);
    if (!item) {
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="error">Content item not found.</Typography>
        </Box>
      );
    }

    const handleConfirmDeleteContent = async () => {
      try {
        setDeleting(true);
        setError(null);
        await deleteContent(item.id);
        if (onContentDeleted) onContentDeleted(item.id);
        setConfirmDeleteContentOpen(false);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setDeleting(false);
      }
    };

    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ flexGrow: 1 }}>
            {item.item_id || item.id}
          </Typography>
          <IconButton
            size="small"
            color="error"
            aria-label="Delete content"
            onClick={() => setConfirmDeleteContentOpen(true)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="subtitle2" gutterBottom>
          Type: {item.content_type}
        </Typography>
        <Typography variant="body1" gutterBottom>
          {item.prompt}
        </Typography>
        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
        {/* TODO: show takes for this content, actions, flags */}

        <Dialog
          open={confirmDeleteContentOpen}
          onClose={() => {
            if (!deleting) setConfirmDeleteContentOpen(false);
          }}
        >
          <DialogTitle>Delete content?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              This will remove this content item and all of its takes. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteContentOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="error" onClick={handleConfirmDeleteContent} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  if (selectedNode.type === 'root') {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography variant="h6" gutterBottom>
          Actors
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Manage voice actors and their content.
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add New Actor
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Actor name"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            sx={{ mb: 2 }}
          />
          
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              disabled={!actorName.trim() || creatingActor}
              onClick={handleCreateActor}
            >
              {creatingActor ? 'Creating…' : 'Add Simple Actor'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={!actorName.trim() || creatingActor}
              onClick={handleShowAdvancedForm}
            >
              Add with Provider Settings
            </Button>
          </Stack>

          {showAdvancedActorForm && (
            <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Provider Settings
              </Typography>
              
              {/* Dialogue Settings */}
              <Typography variant="body2" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
                Dialogue (ElevenLabs)
              </Typography>
              <Stack spacing={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Voice</InputLabel>
                  <Select
                    value={actorProviders.dialogue.voice_id}
                    label="Voice"
                    disabled={loadingVoices}
                    onChange={(e) => setActorProviders(prev => ({
                      ...prev,
                      dialogue: { ...prev.dialogue, voice_id: e.target.value }
                    }))}
                  >
                    {loadingVoices ? (
                      <MenuItem disabled>Loading voices...</MenuItem>
                    ) : voices.length === 0 ? (
                      <MenuItem disabled>No voices available</MenuItem>
                    ) : (
                      voices.map(voice => (
                        <MenuItem key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
                
                {voices.length === 0 && !loadingVoices && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={loadVoices}
                    disabled={loadingVoices}
                  >
                    Retry Loading Voices
                  </Button>
                )}
                
                <Stack direction="row" spacing={2}>
                  <TextField
                    size="small"
                    label="Batch Generate"
                    type="number"
                    value={actorProviders.dialogue.batch_generate}
                    onChange={(e) => setActorProviders(prev => ({
                      ...prev,
                      dialogue: { ...prev.dialogue, batch_generate: parseInt(e.target.value) || 1 }
                    }))}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    size="small"
                    label="Approval Count"
                    type="number"
                    value={actorProviders.dialogue.approval_count_default}
                    onChange={(e) => setActorProviders(prev => ({
                      ...prev,
                      dialogue: { ...prev.dialogue, approval_count_default: parseInt(e.target.value) || 1 }
                    }))}
                    sx={{ width: 120 }}
                  />
                </Stack>
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Stability: {actorProviders.dialogue.stability}
                  </Typography>
                  <Slider
                    value={actorProviders.dialogue.stability}
                    onChange={(e, value) => setActorProviders(prev => ({
                      ...prev,
                      dialogue: { ...prev.dialogue, stability: value }
                    }))}
                    min={0}
                    max={1}
                    step={0.1}
                    size="small"
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Similarity Boost: {actorProviders.dialogue.similarity_boost}
                  </Typography>
                  <Slider
                    value={actorProviders.dialogue.similarity_boost}
                    onChange={(e, value) => setActorProviders(prev => ({
                      ...prev,
                      dialogue: { ...prev.dialogue, similarity_boost: value }
                    }))}
                    min={0}
                    max={1}
                    step={0.05}
                    size="small"
                  />
                </Box>
              </Stack>

              {/* Music Settings */}
              <Typography variant="body2" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                Music (ElevenLabs)
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  label="Batch Generate"
                  type="number"
                  value={actorProviders.music.batch_generate}
                  onChange={(e) => setActorProviders(prev => ({
                    ...prev,
                    music: { ...prev.music, batch_generate: parseInt(e.target.value) || 1 }
                  }))}
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  label="Approval Count"
                  type="number"
                  value={actorProviders.music.approval_count_default}
                  onChange={(e) => setActorProviders(prev => ({
                    ...prev,
                    music: { ...prev.music, approval_count_default: parseInt(e.target.value) || 1 }
                  }))}
                  sx={{ width: 120 }}
                />
              </Stack>

              {/* SFX Settings */}
              <Typography variant="body2" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                SFX (ElevenLabs)
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  label="Batch Generate"
                  type="number"
                  value={actorProviders.sfx.batch_generate}
                  onChange={(e) => setActorProviders(prev => ({
                    ...prev,
                    sfx: { ...prev.sfx, batch_generate: parseInt(e.target.value) || 1 }
                  }))}
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  label="Approval Count"
                  type="number"
                  value={actorProviders.sfx.approval_count_default}
                  onChange={(e) => setActorProviders(prev => ({
                    ...prev,
                    sfx: { ...prev.sfx, approval_count_default: parseInt(e.target.value) || 1 }
                  }))}
                  sx={{ width: 120 }}
                />
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!actorName.trim() || creatingActor}
                  onClick={handleCreateActorWithProviders}
                >
                  {creatingActor ? 'Creating…' : 'Create Actor with Settings'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowAdvancedActorForm(false)}
                  disabled={creatingActor}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </Box>
    );
  }

  if (selectedNode.type.endsWith('-section')) {
    const contentType = selectedNode.type.replace('-section', '');
    
    // Find the section data using the section ID
    const sectionData = sections.find(s => s.id === selectedNode.id);
    if (!sectionData) {
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="error">Section not found.</Typography>
        </Box>
      );
    }
    
    // Find the actor using the section's actor_id
    const actor = actors.find((a) => a.id === sectionData.actor_id);
    if (!actor) {
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="error">Actor not found.</Typography>
        </Box>
      );
    }

    const providerSettings = actor.provider_settings?.[contentType] || { provider: 'elevenlabs' };
    const currentSectionName = sectionData?.name || contentType.toUpperCase();

    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        {/* Editable Section Name Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {editingSectionName ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder={currentSectionName}
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    updateSectionName(sectionData?.id || `${actor.id}-${contentType}`, sectionName || currentSectionName);
                  }
                }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={() => updateSectionName(sectionData?.id || `${actor.id}-${contentType}`, sectionName || currentSectionName)}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setEditingSectionName(false);
                  setSectionName('');
                }}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {currentSectionName} - {actor.display_name}
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setEditingSectionName(true);
                  setSectionName(sectionData?.name || '');
                }}
              >
                Edit Name
              </Button>
            </Box>
          )}
        </Box>
        
        {/* Collapsible Provider Settings for this section */}
        <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Box 
            sx={{ 
              p: 2, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              '&:hover': { bgcolor: 'action.hover' }
            }}
            onClick={() => setProviderSettingsExpanded(!providerSettingsExpanded)}
          >
            <Typography variant="subtitle2" sx={{ fontSize: '0.9rem' }}>
              Provider Settings
            </Typography>
            {providerSettingsExpanded ? <ExpandLess /> : <ExpandMore />}
          </Box>
          
          <Collapse in={providerSettingsExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, pt: 0 }}>
              <Stack spacing={2}>
            {/* Provider Selection */}
            <FormControl size="small" fullWidth>
              <InputLabel>Provider Mode</InputLabel>
              <Select
                value={providerSettings.provider === 'elevenlabs' || providerSettings.provider === 'manual' ? 'custom' : 'inherit'}
                label="Provider Mode"
                onChange={(e) => {
                  if (e.target.value === 'inherit') {
                    updateActorProviderSettings(actor.id, contentType, { provider: 'inherit' });
                  } else {
                    // Switch to custom - populate with defaults
                    const defaultSettings = {
                      dialogue: {
                        provider: 'elevenlabs',
                        batch_generate: 1,
                        approval_count_default: 1,
                        stability: 0.5,
                        similarity_boost: 0.75,
                      },
                      music: {
                        provider: 'elevenlabs',
                        batch_generate: 1,
                        approval_count_default: 1,
                      },
                      sfx: {
                        provider: 'elevenlabs',
                        batch_generate: 1,
                        approval_count_default: 1,
                      }
                    };
                    updateActorProviderSettings(actor.id, contentType, defaultSettings[contentType]);
                    // Auto-load voices when switching to elevenlabs
                    if (voices.length === 0) {
                      loadVoices();
                    }
                  }
                }}
              >
                <MenuItem value="inherit">Inherit from Defaults</MenuItem>
                <MenuItem value="custom">Custom Settings</MenuItem>
              </Select>
            </FormControl>

            {/* Show custom settings only when not inheriting */}
            {providerSettings.provider !== 'inherit' && (
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel>Provider</InputLabel>
                  <Select
                    value={providerSettings.provider}
                    label="Provider"
                    onChange={(e) => {
                      updateActorProviderSettings(actor.id, contentType, { provider: e.target.value });
                      // Auto-load voices when switching to elevenlabs
                      if (e.target.value === 'elevenlabs' && voices.length === 0) {
                        loadVoices();
                      }
                    }}
                  >
                    <MenuItem value="manual">Manual</MenuItem>
                    <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}

            {/* ElevenLabs Settings */}
            {providerSettings.provider === 'elevenlabs' && (
              <>
                {/* Voice Selection for Dialogue */}
                {contentType === 'dialogue' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Voice</InputLabel>
                    <Select
                      value={providerSettings.voice_id || ''}
                      label="Voice"
                      disabled={loadingVoices}
                      onChange={(e) => {
                        updateActorProviderSettings(actor.id, contentType, { voice_id: e.target.value });
                      }}
                    >
                      {/* Show current voice_id even if not in loaded list */}
                      {providerSettings.voice_id && !voices.find(v => v.voice_id === providerSettings.voice_id) && (
                        <MenuItem value={providerSettings.voice_id}>
                          {providerSettings.voice_id} (current)
                        </MenuItem>
                      )}
                      {loadingVoices ? (
                        <MenuItem disabled>Loading voices...</MenuItem>
                      ) : voices.length === 0 ? (
                        <MenuItem disabled>No voices available</MenuItem>
                      ) : (
                        voices.map(voice => (
                          <MenuItem key={voice.voice_id} value={voice.voice_id}>
                            {voice.name}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                )}

                {voices.length === 0 && !loadingVoices && contentType === 'dialogue' && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={loadVoices}
                    disabled={loadingVoices}
                  >
                    Load Voices
                  </Button>
                )}

                {/* Batch and Approval Settings */}
                <Stack direction="row" spacing={2}>
                  <TextField
                    size="small"
                    label="Batch Generate"
                    type="number"
                    value={providerSettings.batch_generate || 1}
                    onChange={(e) => {
                      updateActorProviderSettings(actor.id, contentType, { batch_generate: parseInt(e.target.value) || 1 });
                    }}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    size="small"
                    label="Approval Count"
                    type="number"
                    value={providerSettings.approval_count_default || 1}
                    onChange={(e) => {
                      updateActorProviderSettings(actor.id, contentType, { approval_count_default: parseInt(e.target.value) || 1 });
                    }}
                    sx={{ width: 120 }}
                  />
                </Stack>

                {/* Dialogue-specific settings */}
                {contentType === 'dialogue' && (
                  <>
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Stability: {providerSettings.stability || 0.5}
                      </Typography>
                      <Slider
                        value={providerSettings.stability || 0.5}
                        onChange={(e, value) => {
                          updateActorProviderSettings(actor.id, contentType, { stability: value });
                        }}
                        min={0}
                        max={1}
                        step={0.1}
                        size="small"
                      />
                    </Box>
                    
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Similarity Boost: {providerSettings.similarity_boost || 0.75}
                      </Typography>
                      <Slider
                        value={providerSettings.similarity_boost || 0.75}
                        onChange={(e, value) => {
                          updateActorProviderSettings(actor.id, contentType, { similarity_boost: value });
                        }}
                        min={0}
                        max={1}
                        step={0.05}
                        size="small"
                      />
                    </Box>
                  </>
                )}
              </>
            )}
              </Stack>
            </Box>
          </Collapse>
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mt: 3, fontSize: '0.8rem' }}>
          Add and manage {contentType} content for this actor.
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
            Add New {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Content
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.8rem' }}>
            Use commas to create multiple items at once: "Hi, Yes, No, My name is, Go away, I'm gonna kill you"
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Item IDs (required)"
            placeholder="Hi, Yes, No, My name is, Go away, I'm gonna kill you"
            value={contentItemId}
            onChange={(e) => setContentItemId(e.target.value)}
            required
            sx={{ mb: 1 }}
            helperText="Separate multiple items with commas for batch creation"
          />
          <TextField
            fullWidth
            size="small"
            multiline
            rows={3}
            label={`${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Prompt (optional)`}
            placeholder={`${contentType} prompt or description`}
            value={contentPrompt}
            onChange={(e) => setContentPrompt(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={!contentItemId.trim() || creatingContent}
            onClick={() => handleCreateContent(sectionData.actor_id, sectionData.content_type)}
          >
            {creatingContent ? 'Creating…' : `Add ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Content`}
          </Button>
        </Box>

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </Box>
    );
  }

  if (selectedNode.type === 'defaults') {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography variant="h6" gutterBottom>
          Defaults
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Configure default provider settings for new actors.
        </Typography>
        <Typography variant="body2" gutterBottom>
          Select a provider type below to view and edit defaults.
        </Typography>
      </Box>
    );
  }

  if (selectedNode.type === 'provider-default') {
    const providerType = selectedNode.id;
    const defaultSettings = {
      dialogue: {
        provider: 'elevenlabs',
        batch_generate: 1,
        approval_count_default: 1,
        stability: 0.5,
        similarity_boost: 0.75,
      },
      music: {
        provider: 'elevenlabs',
        batch_generate: 1,
        approval_count_default: 1,
      },
      sfx: {
        provider: 'elevenlabs',
        batch_generate: 1,
        approval_count_default: 1,
      },
    };
    const settings = defaultSettings[providerType];

    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography variant="h6" gutterBottom>
          {providerType.charAt(0).toUpperCase() + providerType.slice(1)} Provider Defaults
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          These defaults are used when creating new actors.
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Provider: {settings.provider}
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            Batch Generate (takes per build): {settings.batch_generate}
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            Approval Count Default (target approved takes): {settings.approval_count_default}
          </Typography>
          {providerType === 'dialogue' && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Stability: {settings.stability}
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                Similarity Boost: {settings.similarity_boost}
              </Typography>
            </>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Note: Editing defaults will be implemented in a future update.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Typography variant="body1">Selected node type: {selectedNode.type}</Typography>
    </Box>
  );
}
