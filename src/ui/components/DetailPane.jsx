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
import DeleteIcon from '@mui/icons-material/Delete';
import { createActor, createContent, createSection, deleteActor, deleteContent, getVoices, updateActor } from '../api/client.js';

export default function DetailPane({ actors, content, sections, selectedNode, onActorCreated, onContentCreated, onActorDeleted, onContentDeleted, onSectionCreated, onActorUpdated }) {
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
        item_id: contentItemId || undefined,
        prompt: contentPrompt,
      });
      if (result && result.content && onContentCreated) {
        onContentCreated(result.content);
      }
      setContentPrompt('');
      setContentItemId('');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingContent(false);
    }
  };

  const handleCreateSection = async (actorId, contentType) => {
    try {
      setCreatingContent(true);
      setError(null);
      
      const result = await createSection({
        actor_id: actorId,
        content_type: contentType,
      });
      
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
          <Typography variant="h6" gutterBottom sx={{ flexGrow: 1 }}>
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
        
        <Typography variant="body2" gutterBottom>
          Base filename: {actor.base_filename}
        </Typography>
        <Typography variant="body2" gutterBottom>
          Aliases: {actor.aliases && actor.aliases.length ? actor.aliases.join(', ') : '—'}
        </Typography>

        {/* Provider Settings */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Provider Settings
          </Typography>
          
          {/* Dialogue Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Dialogue
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Provider: {actor.provider_settings?.dialogue?.provider || 'manual'}
              {actor.provider_settings?.dialogue?.voice_id && (
                <> • Voice ID: {actor.provider_settings.dialogue.voice_id}</>
              )}
            </Typography>
            {actor.provider_settings?.dialogue?.provider === 'elevenlabs' && (
              <Typography variant="body2" color="text.secondary">
                Batch: {actor.provider_settings.dialogue.batch_generate || 1} • 
                Approval: {actor.provider_settings.dialogue.approval_count_default || 1} • 
                Stability: {actor.provider_settings.dialogue.stability || 0.5} • 
                Similarity: {actor.provider_settings.dialogue.similarity_boost || 0.75}
              </Typography>
            )}
          </Box>

          {/* Music Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Music
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Provider: {actor.provider_settings?.music?.provider || 'manual'}
              {actor.provider_settings?.music?.provider === 'elevenlabs' && (
                <> • Batch: {actor.provider_settings.music.batch_generate || 1} • 
                Approval: {actor.provider_settings.music.approval_count_default || 1}</>
              )}
            </Typography>
          </Box>

          {/* SFX Provider */}
          <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              SFX
            </Typography>
            <Typography variant="body2" color="text.secondary">
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
          <Typography variant="h6" gutterBottom>
            Content Sections
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Add content sections for this actor. Click on a section in the tree to add content.
          </Typography>
          
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" sx={{ minWidth: 80 }}>
                Dialogue:
              </Typography>
              {hasDialogue ? (
                <Typography variant="body2" color="success.main">
                  ✓ Section exists
                </Typography>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleCreateSection(actor.id, 'dialogue')}
                  disabled={creatingContent}
                >
                  Add Dialogue Section
                </Button>
              )}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" sx={{ minWidth: 80 }}>
                Music:
              </Typography>
              {hasMusic ? (
                <Typography variant="body2" color="success.main">
                  ✓ Section exists
                </Typography>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleCreateSection(actor.id, 'music')}
                  disabled={creatingContent}
                >
                  Add Music Section
                </Button>
              )}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" sx={{ minWidth: 80 }}>
                SFX:
              </Typography>
              {hasSfx ? (
                <Typography variant="body2" color="success.main">
                  ✓ Section exists
                </Typography>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleCreateSection(actor.id, 'sfx')}
                  disabled={creatingContent}
                >
                  Add SFX Section
                </Button>
              )}
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
    const actor = actors.find((a) => a.id === selectedNode.id);
    if (!actor) {
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="error">Actor not found.</Typography>
        </Box>
      );
    }

    const providerSettings = actor.provider_settings?.[contentType] || { provider: 'elevenlabs' };

    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography variant="h6" gutterBottom>
          {contentType.toUpperCase()} - {actor.display_name}
        </Typography>
        
        {/* Editable Provider Settings for this section */}
        <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Provider Settings
          </Typography>
          
          <Stack spacing={2}>
            {/* Provider Selection */}
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

        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mt: 3 }}>
          Add and manage {contentType} content for this actor.
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add New {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Content
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Item ID (optional)"
            value={contentItemId}
            onChange={(e) => setContentItemId(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth
            size="small"
            multiline
            rows={3}
            placeholder={`${contentType} prompt or description`}
            value={contentPrompt}
            onChange={(e) => setContentPrompt(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={!contentPrompt.trim() || creatingContent}
            onClick={() => handleCreateContent(actor.id, contentType)}
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
