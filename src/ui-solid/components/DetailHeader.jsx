import { Box, Typography, IconButton, Tooltip } from '@suid/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@suid/icons-material';

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
                    <Typography variant="h5" component="h1" noWrap title={props.title}>
                        {props.title}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {props.onEdit && (
                            <Tooltip title={props.editTooltip || "Edit"} arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={props.onEdit}
                                        disabled={props.editDisabled}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        )}

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

                {props.subtitle && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                        {props.subtitle}
                    </Typography>
                )}
            </Box>

            {/* Right actions area (e.g. Complete button) */}
            <Box sx={{ ml: 2, flexShrink: 0 }}>
                {props.rightActions}
            </Box>
        </Box>
    );
}
