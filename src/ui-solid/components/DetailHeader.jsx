import { Box, Typography, IconButton } from '@suid/material';
import TextInput from './TextInput.jsx';
import EditIcon from '@suid/icons-material/Edit';
import DeleteIcon from '@suid/icons-material/Delete';
import CheckIcon from '@suid/icons-material/Check';
import CloseIcon from '@suid/icons-material/Close';
import Tooltip from './Tooltip.jsx';
import { Show } from 'solid-js';

export default function DetailHeader(props) {
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
            borderBottom: 1,
            borderColor: 'divider',
            pb: 2
        }}>
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Show when={props.isEditing} fallback={
                        <Typography variant="h5" component="h1" noWrap title={props.title}>
                            {props.title}
                        </Typography>
                    }>
                        <TextInput
                            size="small"
                            value={props.editValue || ''}
                            onValueChange={props.onEditChange}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') props.onEditSave?.();
                                if (e.key === 'Escape') props.onEditCancel?.();
                            }}
                            sx={{ flexGrow: 1 }}
                        />
                    </Show>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Show when={props.isEditing} fallback={
                            <Show when={props.onEdit}>
                                <Tooltip title={props.editTooltip || "Edit"} arrow>
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={props.onEdit}
                                            disabled={props.editDisabled}
                                        >
                                            <EditIcon sx={{ fontSize: '0.875rem' }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Show>
                        }>
                            <IconButton onClick={props.onEditSave} color="primary" size="small"><CheckIcon fontSize="small" /></IconButton>
                            <IconButton onClick={props.onEditCancel} size="small"><CloseIcon fontSize="small" /></IconButton>
                        </Show>

                        {props.onDelete && (
                            <Tooltip title={props.deleteTooltip || "Delete"} arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={props.onDelete}
                                        disabled={props.deleteDisabled}
                                        color="error"
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        )}
                    </Box>
                </Box>

                <Show when={!props.isEditing && props.subtitle}>
                    <Typography variant="body2" color="text.secondary" noWrap>
                        {props.subtitle}
                    </Typography>
                </Show>
            </Box>

            {/* Right actions area (e.g. Complete button) */}
            <Box sx={{ ml: 2, flexShrink: 0 }}>
                {props.rightActions}
            </Box>
        </Box>
    );
}
