import { createSignal, createEffect, For, Show, createMemo } from 'solid-js';
import {
    Box, Typography, List, ListItemButton, ListItemText, ListItemIcon, IconButton, Button
} from '@suid/material';
import ExpandLessIcon from '@suid/icons-material/ExpandLess';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import PersonIcon from '@suid/icons-material/Person';
import SettingsIcon from '@suid/icons-material/Settings';
import RecordVoiceOverIcon from '@suid/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@suid/icons-material/MusicNote';
import GraphicEqIcon from '@suid/icons-material/GraphicEq';
import TerminalIcon from '@suid/icons-material/Terminal';
import HistoryIcon from '@suid/icons-material/History';
import StarIcon from '@suid/icons-material/Star';
import StarBorderIcon from '@suid/icons-material/StarBorder';
import FolderIcon from '@suid/icons-material/Folder';
import AssessmentIcon from '@suid/icons-material/Assessment';
import AddIcon from '@suid/icons-material/Add';

import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { TREE_INDENT } from '../constants.js';
import ViewTree from './ViewTree.jsx';
import { PRESET_VIEWS, buildViewTree, getAllViews, getStickyName } from '../utils/viewEngine.js';
import Collapse from './Collapse.jsx';

function nodeKey(type, id) {
    return `${type}:${id}`;
}

export default function TreePane(props) {
    const selectedId = () => props.selectedNode ? nodeKey(props.selectedNode.type, props.selectedNode.id) : null;

    // --- Persistence ---
    const [expanded, setExpanded] = createSignal((() => {
        try {
            const saved = localStorage.getItem('moo-tree-expanded');
            return saved ? JSON.parse(saved) : { views: true, favorites: true };
        } catch (e) {
            return { views: true, favorites: true };
        }
    })());

    const [pinnedIds, setPinnedIds] = createSignal((() => {
        try {
            const saved = localStorage.getItem('moo-pinned-views');
            return saved ? JSON.parse(saved) : ["by-actor"];
        } catch (e) {
            return ["by-actor"];
        }
    })());

    const saveExpanded = (newState) => {
        localStorage.setItem('moo-tree-expanded', JSON.stringify(newState));
    };

    const handleToggle = (key) => {
        setExpanded(prev => {
            const newState = { ...prev, [key]: !prev[key] };
            saveExpanded(newState);
            return newState;
        });
    };

    const togglePin = (e, id) => {
        e.stopPropagation();
        setPinnedIds(prev => {
            const newState = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
            localStorage.setItem('moo-pinned-views', JSON.stringify(newState));
            return newState;
        });
    };

    const createNewView = (e, category) => {
        e.stopPropagation();
        const id = `custom-${category}-${Date.now()}`;
        const newView = {
            id,
            name: '', // Sticky title will handle display
            category,
            levels: [
                { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
                { field: 'scene_id', displayField: 'scene_name', icon: 'folder' },
                { field: 'section_id', displayField: 'section_name', icon: 'folder' },
                { field: 'content_id', displayField: 'name', icon: 'content', isTerminal: true }
            ]
        };
        props.onCustomViewsChange([...props.customViews, newView]);
        // Auto-select the new view for editing
        props.onSelect({ type: 'view-config', id: newView.id });
    };

    // --- Views logic ---
    const allViews = createMemo(() => getAllViews(props.customViews));
    const pinnedViews = createMemo(() => allViews().filter(v => pinnedIds().includes(v.id)));
    const workflowViews = createMemo(() => allViews().filter(v => v.category === 'view' && !pinnedIds().includes(v.id)));
    const summaryViews = createMemo(() => allViews().filter(v => v.category === 'summary' && !pinnedIds().includes(v.id)));

    const categories = createMemo(() => [
        { id: 'favorites', name: 'favorites', icon: <StarIcon sx={{ fontSize: '0.875rem' }} />, items: pinnedViews() },
        { id: 'views', name: 'views', icon: <FolderIcon sx={{ fontSize: '0.875rem' }} />, items: workflowViews(), canAdd: true },
        { id: 'summaries', name: 'summaries', icon: <AssessmentIcon sx={{ fontSize: '0.875rem' }} />, items: summaryViews(), canAdd: true },
        {
            id: 'system', name: 'system', icon: <SettingsIcon sx={{ fontSize: '0.875rem' }} />, items: [
                { id: 'console', name: 'console', nodeType: 'console', nodeId: 'console', icon: <TerminalIcon sx={{ fontSize: '0.75rem' }} /> },
                { id: 'history', name: 'history', nodeType: 'history', nodeId: 'logs', icon: <HistoryIcon sx={{ fontSize: '0.75rem' }} /> },
                {
                    id: 'defaults', name: 'defaults', nodeType: 'defaults', nodeId: 'providers', icon: <SettingsIcon sx={{ fontSize: '0.75rem' }} />,
                    isDefaults: true,
                    children: ['dialogue', 'music', 'sfx'].map(type => ({
                        id: type, name: `${type} (elevenlabs)`, nodeType: 'provider-default', nodeId: type,
                        icon: type === 'dialogue' ? <RecordVoiceOverIcon sx={{ fontSize: '0.75rem' }} /> :
                            type === 'music' ? <MusicNoteIcon sx={{ fontSize: '0.75rem' }} /> : <GraphicEqIcon sx={{ fontSize: '0.75rem' }} />
                    }))
                }
            ]
        }
    ]);

    const handleSelect = (type, id) => {
        props.onSelect({ type, id });
    };

    const handleViewSelect = (e, item) => {
        // If they click the text/expand area, toggle expand.
        // If they click specifically to edit (handled later by selection logic), standard behavior.
        // For now, let's say selecting a view-config is a separate action or happens when selecting the group.

        // Actually, let's make it so clicking a View Group selects it for config IN ADDITION to toggling it.
        handleToggle(`item-${item.id}`);
        props.onSelect({ type: 'view-config', id: item.id });
    };

    return (
        <Box
            sx={{
                width: props.width || 300,
                flexShrink: 0,
                borderRight: 1,
                borderColor: 'divider',
                height: '100%',
                maxHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                backgroundColor: 'background.paper'
            }}
        >
            <List dense disablePadding sx={{ px: '0.3125rem', pt: '0.5rem', pb: '0.625rem', flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                <For each={categories()}>
                    {(cat) => (
                        <Box sx={{ mb: '0.5rem' }}>
                            <ListItemButton
                                sx={{
                                    pl: `${TREE_INDENT.BASE}px`,
                                    pr: '0.25rem',
                                    color: 'text.secondary',
                                    fontWeight: 700,
                                    minHeight: '1.5rem',
                                    '&:hover': { bgcolor: 'transparent' }
                                }}
                                onClick={() => handleToggle(cat.id)}
                            >
                                <ListItemIcon sx={{ minWidth: 'auto', mr: '0.375rem', color: 'primary.main', opacity: 0.8 }}>
                                    {cat.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={cat.name}
                                    primaryTypographyProps={{
                                        fontSize: '0.75rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em'
                                    }}
                                />
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Show when={cat.canAdd}>
                                        <IconButton size="small" onClick={(e) => createNewView(e, cat.id === 'views' ? 'view' : 'summary')} sx={{ p: '2px', opacity: 0.6, '&:hover': { opacity: 1, color: 'primary.main' } }}>
                                            <AddIcon sx={{ fontSize: '0.9rem' }} />
                                        </IconButton>
                                    </Show>
                                    <Box sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0, opacity: 0.5 }}>
                                        {expanded()[cat.id] ? <ExpandLessIcon sx={{ fontSize: '0.75rem' }} /> : <ExpandMoreIcon sx={{ fontSize: '0.75rem' }} />}
                                    </Box>
                                </Box>
                            </ListItemButton>

                            <Collapse in={expanded()[cat.id]}>
                                <List disablePadding>
                                    <For each={cat.items}>
                                        {(item) => {
                                            const itemKey = `item-${item.id}`;
                                            const isView = item.category === 'view' || item.category === 'summary';
                                            const isSelected = () => props.selectedNode?.type === 'view-config' && props.selectedNode?.id === item.id;

                                            return (
                                                <Box>
                                                    <ListItemButton
                                                        sx={{
                                                            pl: `${TREE_INDENT.BASE + TREE_INDENT.STEP}px`,
                                                            pr: '0.25rem',
                                                            py: '0.125rem',
                                                            ...DESIGN_SYSTEM.treeItem
                                                        }}
                                                        selected={isSelected() || (!isView && selectedId() === nodeKey(item.nodeType, item.nodeId))}
                                                        onClick={(e) => isView ? handleViewSelect(e, item) : handleSelect(item.nodeType, item.nodeId)}
                                                    >
                                                        <ListItemIcon sx={{ minWidth: 'auto', mr: '0.375rem' }}>
                                                            {isView ? (
                                                                item.category === 'summary' ? <AssessmentIcon sx={{ fontSize: '0.75rem', opacity: 0.7 }} /> : <FolderIcon sx={{ fontSize: '0.75rem', opacity: 0.7 }} />
                                                            ) : item.icon}
                                                        </ListItemIcon>
                                                        <ListItemText
                                                            primary={getStickyName(item)}
                                                            primaryTypographyProps={{
                                                                fontSize: '0.9rem',
                                                                lineHeight: '1.125rem',
                                                                fontWeight: isView ? 600 : 400
                                                            }}
                                                        />

                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', ml: 'auto' }}>
                                                            {isView && (
                                                                <IconButton size="small" onClick={(e) => togglePin(e, item.id)} sx={{ p: 0, color: pinnedIds().includes(item.id) ? 'primary.main' : 'text.disabled', opacity: 0.7 }}>
                                                                    {pinnedIds().includes(item.id) ? <StarIcon sx={{ fontSize: '0.75rem' }} /> : <StarBorderIcon sx={{ fontSize: '0.75rem' }} />}
                                                                </IconButton>
                                                            )}
                                                            {isView && (
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={(e) => { e.stopPropagation(); props.onSelect({ type: 'root', id: 'root' }); }}
                                                                    sx={{ p: 0, opacity: 0.6, '&:hover': { opacity: 1, color: 'primary.main' } }}
                                                                >
                                                                    <AddIcon sx={{ fontSize: '0.9rem' }} />
                                                                </IconButton>
                                                            )}
                                                            {(isView || item.isDefaults) && (
                                                                <Box onClick={(e) => { e.stopPropagation(); handleToggle(itemKey); }} sx={{ display: 'flex', alignItems: 'center', opacity: 0.5 }}>
                                                                    {expanded()[itemKey] ? <ExpandLessIcon sx={{ fontSize: '0.75rem' }} /> : <ExpandMoreIcon sx={{ fontSize: '0.75rem' }} />}
                                                                </Box>
                                                            )}
                                                        </Box>
                                                    </ListItemButton>

                                                    <Collapse in={expanded()[itemKey]}>
                                                        <Show when={isView}>
                                                            <ViewTree
                                                                viewId={item.id}
                                                                viewName={getStickyName(item)}
                                                                tree={buildViewTree(item.id, {
                                                                    actors: props.actors,
                                                                    sections: props.sections,
                                                                    content: props.content,
                                                                    takes: props.takes,
                                                                    scenes: props.scenes || []
                                                                }, props.customViews)}
                                                                selectedNode={props.selectedNode}
                                                                onSelect={props.onSelect}
                                                                baseDepth={2}
                                                                onAddActor={() => props.onSelect({ type: 'root', id: 'root' })}
                                                                onAddScene={() => props.onSelect({ type: 'root', id: 'root' })}
                                                            />
                                                        </Show>
                                                        <Show when={item.isDefaults}>
                                                            <For each={item.children}>
                                                                {(child) => (
                                                                    <ListItemButton
                                                                        sx={{
                                                                            pl: `${TREE_INDENT.BASE + TREE_INDENT.STEP * 2}px`,
                                                                            ...DESIGN_SYSTEM.treeItem
                                                                        }}
                                                                        selected={selectedId() === nodeKey(child.nodeType, child.nodeId)}
                                                                        onClick={() => handleSelect(child.nodeType, child.nodeId)}
                                                                    >
                                                                        <ListItemIcon sx={{ minWidth: 'auto', mr: '0.375rem' }}>
                                                                            {child.icon}
                                                                        </ListItemIcon>
                                                                        <ListItemText primary={child.name} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                                                                    </ListItemButton>
                                                                )}
                                                            </For>
                                                        </Show>
                                                    </Collapse>
                                                </Box>
                                            );
                                        }}
                                    </For>
                                </List>
                            </Collapse>
                        </Box>
                    )}
                </For>
            </List>

            <Box sx={{ px: '1rem', py: '0.5rem', color: 'text.secondary', borderTop: 1, borderColor: 'divider', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.5rem', bgcolor: 'action.hover' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'success.main', boxShadow: '0 0 4px rgba(0,0,0,0.2)' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>Complete</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'warning.main', boxShadow: '0 0 4px rgba(0,0,0,0.2)' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>In Progress</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'error.main', boxShadow: '0 0 4px rgba(0,0,0,0.2)' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>Fault</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'text.disabled', boxShadow: '0 0 4px rgba(0,0,0,0.2)' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>Empty</Typography>
                </Box>
            </Box>
        </Box>
    );
}
