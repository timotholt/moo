/**
 * ViewTree - Renders a dynamic view tree from a view definition
 * 
 * This component takes a grouped tree structure (from viewEngine.groupByLevels)
 * and renders it as an expandable/collapsible tree.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import FolderIcon from '@mui/icons-material/Folder';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// ============================================================================
// Icon Mapping
// ============================================================================

function getIconForType(iconType, fieldValue, contentType, fileIcon) {
  const iconStyle = { fontSize: '0.75rem' };
  
  // For leaves, use fileIcon if provided, otherwise content type
  if (iconType === 'leaf' || iconType === undefined) {
    // File-specific icons
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
    // Fall back to content type
    if (contentType === 'dialogue') return <RecordVoiceOverIcon sx={iconStyle} />;
    if (contentType === 'music') return <MusicNoteIcon sx={iconStyle} />;
    if (contentType === 'sfx') return <GraphicEqIcon sx={iconStyle} />;
    if (contentType === 'image' || contentType === 'storyboard') return <ImageIcon sx={iconStyle} />;
    if (contentType === 'video') return <VideoFileIcon sx={iconStyle} />;
    if (contentType === 'script' || contentType === 'notes') return <DescriptionIcon sx={iconStyle} />;
    return <AudioFileIcon sx={iconStyle} />;
  }
  
  switch (iconType) {
    case 'person':
      return <PersonIcon sx={iconStyle} />;
    case 'folder':
      return <FolderIcon sx={iconStyle} />;
    case 'content':
    case 'record':
      return <RecordVoiceOverIcon sx={iconStyle} />;
    case 'type':
      // Content type icons
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
    default:
      return <InsertDriveFileIcon sx={iconStyle} />;
  }
}

// ============================================================================
// Status Color Mapping
// ============================================================================

function getStatusClass(status) {
  switch (status) {
    case 'green':
      return 'status-green';
    case 'yellow':
      return 'status-yellow';
    case 'red':
      return 'status-red';
    case 'gray':
    default:
      return 'status-gray';
  }
}

// ============================================================================
// Tree Node Component
// ============================================================================

function TreeNode({ 
  node, 
  depth, 
  expanded, 
  onToggle, 
  selectedId, 
  onSelect,
  viewId,
}) {
  const isExpanded = expanded[node.id] || false;
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = node.type === 'leaf';
  
  // Calculate indentation based on depth
  // Base indent of 2.5rem (indented under view name at 1.5rem), plus 1rem per depth level
  const paddingLeft = `${2.5 + depth * 1}rem`;
  
  const handleClick = () => {
    if (isLeaf) {
      // For leaves (takes), select the take
      onSelect({ type: 'take', id: node.data.take_id, viewId });
    } else {
      // For groups, select the group (could show summary view)
      onSelect({ 
        type: 'view-group', 
        id: node.id, 
        field: node.field,
        fieldValue: node.fieldValue,
        viewId,
        children: node.children,
      });
    }
  };
  
  const handleToggle = (e) => {
    e.stopPropagation();
    onToggle(node.id);
  };
  
  // Build display text
  let displayText = node.label;
  if (!isLeaf && node.count) {
    displayText = `${node.label} (${node.count})`;
  }
  
  return (
    <>
      <ListItemButton
        className={getStatusClass(node.status || 'gray')}
        sx={{
          py: '0.125rem',
          pl: paddingLeft,
          pr: 0,
          minHeight: '1.125rem',
          '& .MuiListItemText-root': { margin: 0 },
          '& .MuiListItemIcon-root': { minWidth: 'auto' },
          ...DESIGN_SYSTEM.treeItem,
        }}
        selected={isSelected}
        onClick={handleClick}
      >
        <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
          {getIconForType(
            node.icon, 
            node.fieldValue, 
            isLeaf ? node.data?.content_type : null,
            isLeaf ? node.fileIcon : null
          )}
        </ListItemIcon>
        <ListItemText
          primary={displayText}
          primaryTypographyProps={{
            fontSize: '0.9rem',
            lineHeight: '1rem',
            fontWeight: 400,
          }}
        />
        {hasChildren && !isLeaf && (
          <Box
            onClick={handleToggle}
            sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}
          >
            {isExpanded ? (
              <ExpandLess sx={{ fontSize: '0.75rem' }} />
            ) : (
              <ExpandMore sx={{ fontSize: '0.75rem' }} />
            )}
          </Box>
        )}
      </ListItemButton>
      
      {hasChildren && !isLeaf && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                selectedId={selectedId}
                onSelect={onSelect}
                viewId={viewId}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
}

// ============================================================================
// ViewTree Component
// ============================================================================

export default function ViewTree({
  viewId,
  viewName,
  tree,
  selectedNode,
  onSelect,
}) {
  // Load expanded state from localStorage (per-view)
  const storageKey = `audiomanager-view-expanded-${viewId}`;
  
  const loadExpandedState = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load view state from localStorage:', e);
    }
    return {};
  }, [storageKey]);
  
  const [expanded, setExpanded] = useState(loadExpandedState);
  
  // Save expanded state when it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expanded));
    } catch (e) {
      console.warn('Failed to save view state to localStorage:', e);
    }
  }, [expanded, storageKey]);
  
  const handleToggle = useCallback((nodeId) => {
    setExpanded((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  }, []);
  
  // Determine selected ID for highlighting
  const selectedId = selectedNode?.viewId === viewId ? selectedNode.id : null;
  
  if (!tree || tree.length === 0) {
    return (
      <Box sx={{ pl: '1.5rem', py: '0.25rem', color: 'text.disabled' }}>
        <em style={{ fontSize: '0.8rem' }}>No items</em>
      </Box>
    );
  }
  
  return (
    <List component="div" disablePadding>
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          selectedId={selectedId}
          onSelect={onSelect}
          viewId={viewId}
        />
      ))}
    </List>
  );
}
