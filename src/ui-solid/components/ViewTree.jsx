import { createSignal, createEffect, For, Show } from 'solid-js';
import {
    Box, List, ListItemButton, ListItemText, ListItemIcon, Button
} from '@suid/material';
import ExpandLess from '@suid/icons-material/ExpandLess';
import ExpandMore from '@suid/icons-material/ExpandMore';
import KeyboardArrowRight from '@suid/icons-material/KeyboardArrowRight';
import PersonIcon from '@suid/icons-material/Person';
import FolderIcon from '@suid/icons-material/Folder';
import RecordVoiceOverIcon from '@suid/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@suid/icons-material/MusicNote';
import GraphicEqIcon from '@suid/icons-material/GraphicEq';
import CheckCircleIcon from '@suid/icons-material/CheckCircle';
import NewReleasesIcon from '@suid/icons-material/NewReleases';
import CancelIcon from '@suid/icons-material/Cancel';
import VisibilityOffIcon from '@suid/icons-material/VisibilityOff';
import AudioFileIcon from '@suid/icons-material/AudioFile';
import ImageIcon from '@suid/icons-material/Image';
import VideoFileIcon from '@suid/icons-material/VideoFile';
import DescriptionIcon from '@suid/icons-material/Description';
import PictureAsPdfIcon from '@suid/icons-material/PictureAsPdf';
import ArticleIcon from '@suid/icons-material/Article';
import InsertDriveFileIcon from '@suid/icons-material/InsertDriveFile';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { TREE_INDENT } from '../constants.js';
import { storage } from '../utils/storage.js';
import Collapse from './Collapse.jsx';

function getIconForType(iconType, fieldValue, mediaType, fileIcon) {
    const iconStyle = { fontSize: '0.75rem' };

    if (iconType === 'leaf' || iconType === undefined) {
        if (fileIcon) {
            switch (fileIcon) {
                case 'audioFile': return <AudioFileIcon sx={iconStyle} />;
                case 'imageFile': return <ImageIcon sx={iconStyle} />;
                case 'videoFile': return <VideoFileIcon sx={iconStyle} />;
                case 'pdfFile': return <PictureAsPdfIcon sx={iconStyle} />;
                case 'wordFile': return <ArticleIcon sx={iconStyle} />;
                case 'textFile': return <DescriptionIcon sx={iconStyle} />;
                case 'file': return <InsertDriveFileIcon sx={iconStyle} />;
            }
        }
        if (mediaType === 'dialogue') return <RecordVoiceOverIcon sx={iconStyle} />;
        if (mediaType === 'music') return <MusicNoteIcon sx={iconStyle} />;
        if (mediaType === 'sfx') return <GraphicEqIcon sx={iconStyle} />;
        if (mediaType === 'image' || mediaType === 'storyboard') return <ImageIcon sx={iconStyle} />;
        if (mediaType === 'video') return <VideoFileIcon sx={iconStyle} />;
        if (mediaType === 'script' || mediaType === 'notes') return <DescriptionIcon sx={iconStyle} />;
        return <AudioFileIcon sx={iconStyle} />;
    }

    switch (iconType) {
        case 'person': return <PersonIcon sx={iconStyle} />;
        case 'folder': return <FolderIcon sx={iconStyle} />;
        case 'media':
        case 'record': return <RecordVoiceOverIcon sx={iconStyle} />;
        case 'type':
            if (fieldValue === 'dialogue') return <RecordVoiceOverIcon sx={iconStyle} />;
            if (fieldValue === 'music') return <MusicNoteIcon sx={iconStyle} />;
            if (fieldValue === 'sfx') return <GraphicEqIcon sx={iconStyle} />;
            if (fieldValue === 'image' || fieldValue === 'storyboard') return <ImageIcon sx={iconStyle} />;
            if (fieldValue === 'video') return <VideoFileIcon sx={iconStyle} />;
            if (fieldValue === 'script' || fieldValue === 'notes') return <DescriptionIcon sx={iconStyle} />;
            return <InsertDriveFileIcon sx={iconStyle} />;
        case 'status':
            if (fieldValue === 'approved') return <CheckCircleIcon sx={{ ...iconStyle, color: 'success.main' }} />;
            if (fieldValue === 'new') return <NewReleasesIcon sx={{ ...iconStyle, color: 'warning.main' }} />;
            if (fieldValue === 'rejected') return <CancelIcon sx={{ ...iconStyle, color: 'error.main' }} />;
            if (fieldValue === 'hidden') return <VisibilityOffIcon sx={iconStyle} />;
            return <AudioFileIcon sx={iconStyle} />;
        default: return <InsertDriveFileIcon sx={iconStyle} />;
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'green': return 'status-green';
        case 'yellow': return 'status-yellow';
        case 'red': return 'status-red';
        default: return 'status-gray';
    }
}

function TreeNode(props) {
    const isExpanded = () => props.expanded[props.node.id] || false;
    const isSelected = () => props.selectedId === props.node.id;
    const hasChildren = () => props.node.children && props.node.children.length > 0;
    const isLeaf = () => props.node.type === 'leaf';

    const paddingLeft = () => `${TREE_INDENT.BASE + (props.depth + props.baseDepth) * TREE_INDENT.STEP}px`;

    const handleClick = () => {
        if (isLeaf()) {
            if (props.node.data.take_id) {
                props.onSelect({ type: 'take', id: props.node.data.take_id, viewId: props.viewId });
            } else {
                props.onSelect({ type: 'media', id: props.node.data.media_id, viewId: props.viewId });
            }
        } else {
            props.onSelect({
                type: 'view-group',
                id: props.node.id,
                field: props.node.field,
                fieldValue: props.node.fieldValue,
                viewId: props.viewId,
                children: props.node.children,
            });
        }
    };

    const handleToggle = (e) => {
        e.stopPropagation();
        props.onToggle(props.node.id);
    };

    const displayText = () => {
        let text = props.node.label;
        if (!isLeaf() && props.node.count) {
            text = `${props.node.label} (${props.node.count})`;
        }
        return text;
    };

    return (
        <>
            <ListItemButton
                class={getStatusClass(props.node.status || 'gray')}
                sx={{
                    pl: paddingLeft(),
                    pr: 0,
                    ...DESIGN_SYSTEM.treeItem,
                    bgcolor: isSelected() ? 'action.selected' : 'transparent',
                }}
                selected={isSelected()}
                onClick={handleClick}
            >
                <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                    {getIconForType(
                        props.node.icon,
                        props.node.fieldValue,
                        isLeaf() ? props.node.data?.media_type : null,
                        isLeaf() ? props.node.fileIcon : null
                    )}
                </ListItemIcon>
                <ListItemText
                    primary={displayText()}
                    primaryTypographyProps={{
                        fontSize: '0.9rem',
                        lineHeight: '1rem',
                        fontWeight: 400,
                    }}
                />
                <Show when={hasChildren() && !isLeaf()}>
                    <Box
                        onClick={handleToggle}
                        sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}
                    >
                        <Show when={isExpanded()} fallback={<KeyboardArrowRight sx={{ fontSize: '0.75rem' }} />}>
                            <ExpandMore sx={{ fontSize: '0.75rem' }} />
                        </Show>
                    </Box>
                </Show>
            </ListItemButton>

            <Show when={hasChildren() && !isLeaf()}>
                <Collapse in={isExpanded()}>
                    <List component="div" disablePadding>
                        <For each={props.node.children}>
                            {(child) => (
                                <TreeNode
                                    node={child}
                                    depth={props.depth + 1}
                                    baseDepth={props.baseDepth}
                                    expanded={props.expanded}
                                    onToggle={props.onToggle}
                                    selectedId={props.selectedId}
                                    onSelect={props.onSelect}
                                    viewId={props.viewId}
                                />
                            )}
                        </For>
                    </List>
                </Collapse>
            </Show>
        </>
    );
}

export default function ViewTree(props) {
    const storageKey = () => `view-expanded-${props.viewId}`;

    const loadExpandedState = () => {
        return storage.get(props.projectName, storageKey(), {});
    };

    const [expanded, setExpanded] = createSignal(loadExpandedState());

    // Persistence Effect
    createEffect(() => {
        storage.set(props.projectName, storageKey(), expanded());
    });

    // Programmatic Expansion Effect
    createEffect(() => {
        const req = props.expandNode;
        if (!req) return;

        const findAndExpand = (nodes) => {
            let found = false;
            for (const node of nodes) {
                const matches = node.id === req ||
                    node.id.endsWith(`/${req}`) ||
                    node.id.split(':')[1] === req ||
                    (node.field === 'owner_type' && node.fieldValue === req.replace(/s$/, ''));

                if (matches) {
                    setExpanded(prev => ({ ...prev, [node.id]: true }));
                    found = true;
                }

                if (node.children && node.children.length > 0) {
                    if (findAndExpand(node.children)) {
                        setExpanded(prev => ({ ...prev, [node.id]: true }));
                        found = true;
                    }
                }
            }
            return found;
        };

        if (props.tree) {
            findAndExpand(props.tree);
        }
    });

    const handleToggle = (nodeId) => {
        setExpanded((prev) => ({
            ...prev,
            [nodeId]: !prev[nodeId],
        }));
    };

    const selectedId = () => props.selectedNode?.viewId === props.viewId ? props.selectedNode.id : null;

    return (
        <Show when={props.tree && props.tree.length > 0} fallback={
            <Box sx={{ pl: `${TREE_INDENT.BASE + (props.baseDepth || 1) * TREE_INDENT.STEP}px`, py: '0.5rem', color: 'text.disabled' }}>
                <em style={{ fontSize: '0.8rem', display: 'block', mb: 1 }}>No items found</em>
                <Button
                    size="small"
                    variant="text"
                    onClick={() => props.onAddActor && props.onAddActor()}
                    sx={{ fontSize: '0.7rem', p: 0, minWidth: 0, textTransform: 'none' }}
                >
                    + Create First Item
                </Button>
            </Box>
        }>
            <List component="div" disablePadding>
                <For each={props.tree}>
                    {(node) => (
                        <TreeNode
                            node={node}
                            depth={0}
                            baseDepth={props.baseDepth || 1}
                            expanded={expanded()}
                            onToggle={handleToggle}
                            selectedId={selectedId()}
                            onSelect={props.onSelect}
                            viewId={props.viewId}
                        />
                    )}
                </For>
            </List>
        </Show>
    );
}
