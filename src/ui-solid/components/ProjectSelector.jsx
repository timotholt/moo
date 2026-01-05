import { createSignal } from 'solid-js';
import { Button } from '@suid/material';
import FolderIcon from '@suid/icons-material/Folder';
import KeyboardArrowDownIcon from '@suid/icons-material/KeyboardArrowDown';

export default function ProjectSelector(props) {
    const handleClick = () => {
        // Close current project and return to WelcomeScreen
        if (props.onProjectChange) {
            props.onProjectChange(null);
            localStorage.removeItem('moo-last-project');
        }
    };

    return (
        <Button
            onClick={handleClick}
            endIcon={<KeyboardArrowDownIcon />}
            sx={{
                color: 'text.secondary',
                textTransform: 'none',
                minWidth: 150,
            }}
        >
            <FolderIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
            {props.currentProject?.displayName || props.currentProject?.name || 'No Project'}
        </Button>
    );
}
