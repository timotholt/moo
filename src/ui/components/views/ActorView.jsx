import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DetailHeader from '../DetailHeader.jsx';
import ProviderSettingsDisplay from '../ProviderSettingsDisplay.jsx';
import SectionManagement from '../SectionManagement.jsx';
import CompleteButton from '../CompleteButton.jsx';
import { DESIGN_SYSTEM } from '../../theme/designSystem.js';
import { buildActorPath } from '../../utils/pathBuilder.js';

export default function ActorView({ 
  actor, 
  sections, 
  actorOps, 
  dataOps, 
  error,
  canCompleteActor = true,
  isLastIncompleteActor = false,
  onLogInfo,
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState('');

  if (!actor) {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: DESIGN_SYSTEM.spacing.containerPadding, minWidth: 0 }}>
        <Typography color="error">Actor not found.</Typography>
      </Box>
    );
  }

  // When actor is complete, lock all controls except the Complete button in the header
  const isLocked = !!actor.actor_complete;

  const handleConfirmDelete = async () => {
    try {
      await actorOps.deleteActor(actor.id, actor.display_name);
      setConfirmDeleteOpen(false);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleSaveDisplayName = () => {
    const newName = displayName || actor.display_name;
    if (dataOps.updateDisplayName && newName !== actor.display_name) {
      dataOps.updateDisplayName(actor.id, newName, actor.display_name);
    }
    setEditingDisplayName(false);
    setDisplayName('');
  };

  const handleStartEditDisplayName = () => {
    if (isLocked) return;
    setEditingDisplayName(true);
    setDisplayName(actor.display_name);
  };

  const subtitle = `type: actor`;

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: DESIGN_SYSTEM.spacing.containerPadding, minWidth: 0 }}>
      {editingDisplayName ? (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={actor.display_name}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveDisplayName();
                }
              }}
              sx={{ flexGrow: 1, ...DESIGN_SYSTEM.components.formControl }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveDisplayName}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setEditingDisplayName(false);
                setDisplayName('');
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      ) : (
        <DetailHeader
          title={actor.display_name}
          subtitle={subtitle}
          onEdit={handleStartEditDisplayName}
          onDelete={() => setConfirmDeleteOpen(true)}
          editTooltip="Edit actor name"
          deleteTooltip="Delete actor"
          editDisabled={isLocked}
          deleteDisabled={isLocked || actorOps.deleting}
          rightActions={
            <CompleteButton
              isComplete={actor.actor_complete}
              onToggle={async () => {
                try {
                  const wasComplete = actor.actor_complete;
                  const nextComplete = !actor.actor_complete;
                  await actorOps.updateActor(actor.id, { actor_complete: nextComplete });

                  // Status-only logs for actor completion/incompletion using full path
                  if (onLogInfo) {
                    const actorName = actor.display_name || actor.id;
                    const path = buildActorPath(actorName);
                    if (nextComplete) {
                      onLogInfo(`user marked ${path} as complete`);
                    } else {
                      onLogInfo(`user marked ${path} as incomplete`);
                    }
                  }

                  // Additional milestone logs when completing (delay to ensure it appears after user action in log)
                  if (!wasComplete && nextComplete && onLogInfo && isLastIncompleteActor) {
                    setTimeout(() => {
                      onLogInfo('All actors in this project are complete.');
                    }, 1000);
                  }
                } catch (err) {
                  // Error handled by hook
                }
              }}
              disabled={actorOps.deleting || (!actor.actor_complete && !canCompleteActor)}
              disabledReason={
                !actor.actor_complete && !canCompleteActor
                  ? 'All cues for this actor must be complete before the actor can be marked complete.'
                  : undefined
              }
              isFinalActor={isLastIncompleteActor}
              itemType="actor"
            />
          }
        />
      )}
      {/* Lock all body controls when actor is complete */}
      <Box sx={{ opacity: isLocked ? 0.6 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
        <ProviderSettingsDisplay actor={actor} />

        <SectionManagement 
          actor={actor}
          sections={sections}
          onCreateSection={dataOps.createSection}
          creatingContent={dataOps.creatingContent}
        />

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </Box>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => {
          if (!actorOps.deleting) setConfirmDeleteOpen(false);
        }}
      >
        <DialogTitle>Delete actor?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will remove this actor and all of their content and takes. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={actorOps.deleting}>
            Cancel
          </Button>
          <Button color="error" onClick={handleConfirmDelete} disabled={actorOps.deleting}>
            {actorOps.deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
