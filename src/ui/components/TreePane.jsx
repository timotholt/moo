import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import DescriptionIcon from '@mui/icons-material/Description';
import TerminalIcon from '@mui/icons-material/Terminal';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

function nodeKey(type, id) {
  return `${type}:${id}`;
}

// Status priority: red (3) > yellow (2) > gray (1) > green (0)
const STATUS_PRIORITY = { green: 0, gray: 1, yellow: 2, red: 3 };

function getContentStatus(content, takes = []) {
  const contentTakes = takes.filter(t => t.content_id === content.id);
  const approvedCount = contentTakes.filter(t => t.status === 'approved').length;
  const hasRejected = contentTakes.some(t => t.status === 'rejected');
  const hasTakes = contentTakes.length > 0;
  
  // GREEN: all_approved flag is set (reached required approval count)
  if (content.all_approved) {
    return { status: 'green', color: 'success.main', approvedCount };
  }
  
  // GRAY: No takes generated yet
  if (!hasTakes) {
    return { status: 'gray', color: 'text.disabled', approvedCount };
  }
  
  // RED: Has takes but none approved (or only rejected)
  if (approvedCount === 0) {
    return { status: 'red', color: 'error.main', approvedCount };
  }
  
  // YELLOW: Has some approved but not complete
  return { status: 'yellow', color: 'warning.main', approvedCount };
}

function getSectionStatus(sectionItem, content, takes) {
  const sectionContent = content.filter(
    c =>
      c.actor_id === sectionItem.actor_id &&
      c.content_type === sectionItem.content_type &&
      c.section_id === sectionItem.id
  );
  
  if (sectionContent.length === 0) {
    return { status: 'gray', color: 'text.disabled' };
  }

  // Aggregate child statuses with explicit precedence:
  // RED > YELLOW > GREEN > GRAY
  let hasRed = false;
  let hasYellow = false;
  let hasGreen = false;

  for (const c of sectionContent) {
    const status = getContentStatus(c, takes);
    if (status.status === 'red') hasRed = true;
    else if (status.status === 'yellow') hasYellow = true;
    else if (status.status === 'green') hasGreen = true;
  }

  if (hasRed) return { status: 'red', color: 'error.main' };
  if (hasYellow) return { status: 'yellow', color: 'warning.main' };
  if (hasGreen) return { status: 'green', color: 'success.main' };
  return { status: 'gray', color: 'text.disabled' };
}

function getActorStatus(actor, sections, content, takes) {
  const actorSections = sections.filter(s => s.actor_id === actor.id);
  
  if (actorSections.length === 0) {
    return { status: 'gray', color: 'text.disabled' };
  }
  
  // Get worst status among children
  let worstPriority = -1;
  let worstStatus = { status: 'gray', color: 'text.disabled' };
  
  for (const s of actorSections) {
    const status = getSectionStatus(s, content, takes);
    const priority = STATUS_PRIORITY[status.status];
    if (priority > worstPriority) {
      worstPriority = priority;
      worstStatus = status;
    }
  }
  
  return worstStatus;
}

export default function TreePane({ width, actors, content, sections, takes = [], selectedNode, onSelect, onExpandNode, playingTakeId, playedTakes = {} }) {
  const selectedId = selectedNode ? nodeKey(selectedNode.type, selectedNode.id) : null;
  
  // Load expanded state from localStorage or use defaults
  const loadExpandedState = () => {
    try {
      const saved = localStorage.getItem('audiomanager-tree-expanded');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load tree state from localStorage:', e);
    }
    // Default: everything collapsed
    return {
      actors: false,
      defaults: false,
      ...actors.reduce((acc, actor) => ({ ...acc, [`actor-${actor.id}`]: false }), {})
    };
  };

  const [expanded, setExpanded] = useState(loadExpandedState);

  const handleSelect = (type, id) => {
    onSelect({ type, id });
  };

  const handleToggle = (key) => {
    setExpanded(prev => {
      const newState = { ...prev, [key]: !prev[key] };
      // Save to localStorage
      try {
        localStorage.setItem('audiomanager-tree-expanded', JSON.stringify(newState));
      } catch (e) {
        console.warn('Failed to save tree state to localStorage:', e);
      }
      return newState;
    });
  };

  const expandNode = useCallback((key) => {
    setExpanded(prev => {
      const newState = { ...prev, [key]: true };
      // Save to localStorage
      try {
        localStorage.setItem('audiomanager-tree-expanded', JSON.stringify(newState));
      } catch (e) {
        console.warn('Failed to save tree state to localStorage:', e);
      }
      return newState;
    });
  }, []);

  // Expose expandNode to parent component
  React.useEffect(() => {
    if (onExpandNode) {
      onExpandNode(expandNode);
    }
  }, [onExpandNode, expandNode]);

  return (
    <Box
      sx={{
        width: width || 300,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        height: '100%',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <List dense disablePadding sx={{ px: '0.3125rem', py: '0.625rem', flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Render sections in order: Defaults first, then alphabetically */}
        {(() => {
          // Define all available sections with their properties
          const allSections = [
            {
              id: 'actors',
              name: 'Actors',
              icon: <PersonIcon sx={{ fontSize: '0.875rem' }} />,
              nodeType: 'root',
              nodeId: 'project',
              order: 0, // Actors first
              children: null // Special handling for actors
            },
            {
              id: 'console',
              name: 'Console',
              icon: <TerminalIcon sx={{ fontSize: '0.875rem' }} />,
              nodeType: 'console',
              nodeId: 'logs',
              order: 1, // After Actors
              children: null, // No children
              noExpand: true // Don't show expand/collapse
            },
            {
              id: 'defaults',
              name: 'Defaults',
              icon: <SettingsIcon sx={{ fontSize: '0.875rem' }} />,
              nodeType: 'defaults',
              nodeId: 'providers',
              order: 2, // After Console
              children: ['dialogue', 'music', 'sfx'].map((type) => ({
                id: type,
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} (ElevenLabs)`,
                icon: type === 'dialogue' ? <RecordVoiceOverIcon sx={{ fontSize: '0.75rem' }} /> :
                      type === 'music' ? <MusicNoteIcon sx={{ fontSize: '0.75rem' }} /> : <GraphicEqIcon sx={{ fontSize: '0.75rem' }} />,
                nodeType: 'provider-default',
                nodeId: type
              }))
            }
            // Future sections like 'Master', 'Templates', etc. can be added here
          ];

          // Sort sections: Defaults first (order: 0), then alphabetically by name
          const sortedSections = allSections.sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.name.localeCompare(b.name);
          });

          return sortedSections.map((section) => (
            <React.Fragment key={section.id}>
              <ListItemButton
                sx={{ 
                  py: '0.125rem', 
                  pl: '0.5rem',
                  pr: 0, 
                  minHeight: '1.125rem',
                  '& .MuiListItemText-root': { margin: 0 },
                  '& .MuiListItemIcon-root': { minWidth: 'auto' },
                  ...DESIGN_SYSTEM.treeItem
                }}
                selected={selectedId === nodeKey(section.nodeType, section.nodeId)}
                onClick={() => handleSelect(section.nodeType, section.nodeId)}
              >
                <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                  {section.icon}
                </ListItemIcon>
                <ListItemText primary={section.name} primaryTypographyProps={{ fontSize: '0.9rem', lineHeight: '1rem' }} />
                {!section.noExpand && (
                  <Box onClick={(e) => { e.stopPropagation(); handleToggle(section.id); }} sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}>
                    {expanded[section.id] ? <ExpandLess sx={{ fontSize: '0.75rem' }} /> : <ExpandMore sx={{ fontSize: '0.75rem' }} />}
                  </Box>
                )}
              </ListItemButton>

              {!section.noExpand && (
              <Collapse in={expanded[section.id]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {section.children ? (
                    // Render predefined children (like provider defaults)
                    section.children.map((child) => (
                      <ListItemButton
                        key={child.id}
                        sx={{ 
                          pl: '1.5rem', 
                          py: 0, 
                          pr: 0, 
                          minHeight: '1.125rem',
                          '& .MuiListItemText-root': { margin: 0 },
                          '& .MuiListItemIcon-root': { minWidth: 'auto' },
                          ...DESIGN_SYSTEM.treeItem
                        }}
                        selected={selectedId === nodeKey(child.nodeType, child.nodeId)}
                        onClick={() => handleSelect(child.nodeType, child.nodeId)}
                      >
                        <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                          {child.icon}
                        </ListItemIcon>
                        <ListItemText primary={child.name} primaryTypographyProps={{ fontSize: '0.9rem', lineHeight: '1rem' }} />
                      </ListItemButton>
                    ))
                  ) : section.id === 'actors' ? (
                    // Special handling for actors section
                    actors.map((actor) => {
                      const actorKey = `actor-${actor.id}`;
                      const actorStatus = getActorStatus(actor, sections, content, takes);
                      return (
                        <Box key={actor.id}>
                          <ListItemButton
                            sx={{ 
                              pl: '1.5rem', 
                              py: 0, 
                              pr: 0, 
                              minHeight: '1.125rem',
                              '& .MuiListItemText-root': { margin: 0 },
                              '& .MuiListItemIcon-root': { minWidth: 'auto' },
                              ...DESIGN_SYSTEM.treeItem
                            }}
                            selected={selectedId === nodeKey('actor', actor.id)}
                            onClick={() => handleSelect('actor', actor.id)}
                          >
                            <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                              <PersonIcon sx={{ fontSize: '0.75rem', color: actorStatus.color }} />
                            </ListItemIcon>
                            <ListItemText primary={actor.display_name} primaryTypographyProps={{ fontSize: '0.9rem', lineHeight: '1rem', fontWeight: 400, color: actorStatus.color }} />
                            <Box onClick={(e) => { e.stopPropagation(); handleToggle(actorKey); }} sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}>
                              {expanded[actorKey] ? <ExpandLess sx={{ fontSize: '0.75rem' }} /> : <ExpandMore sx={{ fontSize: '0.75rem' }} />}
                            </Box>
                          </ListItemButton>

                          <Collapse in={expanded[actorKey]} timeout="auto" unmountOnExit>
                            <List component="div" disablePadding>
                              {sections.filter(s => s.actor_id === actor.id).map((sectionItem) => {
                                const sectionType = sectionItem.content_type;
                                const sectionStatus = getSectionStatus(sectionItem, content, takes);

                                const sectionIcon = sectionType === 'dialogue' ? <RecordVoiceOverIcon sx={{ fontSize: '0.75rem', color: sectionStatus.color }} /> :
                                                  sectionType === 'music' ? <MusicNoteIcon sx={{ fontSize: '0.75rem', color: sectionStatus.color }} /> : <GraphicEqIcon sx={{ fontSize: '0.75rem', color: sectionStatus.color }} />;
                                const sectionKey = `section-${sectionItem.id}`;
                                
                                // Use the section item for custom name
                                const displayName = sectionItem?.name || (sectionType.charAt(0).toUpperCase() + sectionType.slice(1));

                                return (
                                  <Box key={sectionItem.id}>
                                    <ListItemButton
                                      sx={{ 
                                        pl: '2.5rem', 
                                        py: 0, 
                                        pr: 0, 
                                        minHeight: '1.125rem',
                                        '& .MuiListItemText-root': { margin: 0 },
                                        '& .MuiListItemIcon-root': { minWidth: 'auto' },
                                        ...DESIGN_SYSTEM.treeItem
                                      }}
                                      selected={selectedId === nodeKey(`${sectionType}-section`, sectionItem.id)}
                                      onClick={() => handleSelect(`${sectionType}-section`, sectionItem.id)}
                                    >
                                      <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                                        {sectionIcon}
                                      </ListItemIcon>
                                      <ListItemText primary={displayName} primaryTypographyProps={{ fontSize: '0.9rem', lineHeight: '1rem', fontWeight: 400, color: sectionStatus.color }} />
                                      <Box onClick={(e) => { e.stopPropagation(); handleToggle(sectionKey); }} sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}>
                                        {expanded[sectionKey] ? <ExpandLess sx={{ fontSize: '0.75rem' }} /> : <ExpandMore sx={{ fontSize: '0.75rem' }} />}
                                      </Box>
                                    </ListItemButton>

                                    <Collapse in={expanded[sectionKey]} timeout="auto" unmountOnExit>
                                      <List component="div" disablePadding>
                                        {content
                                          .filter(
                                            (c) =>
                                              c.actor_id === actor.id &&
                                              c.content_type === sectionType &&
                                              c.section_id === sectionItem.id
                                          )
                                          .map((c) => {
                                            const contentStatus = getContentStatus(c, takes);
                                            const contentTakes = takes.filter(t => t.content_id === c.id);
                                            const newCount = contentTakes.filter(t => t.status === 'new' && !playedTakes[t.id]).length;

                                            let displayText = contentStatus.approvedCount > 0 
                                              ? `${c.cue_id || c.id} (${contentStatus.approvedCount})`
                                              : (c.cue_id || c.id);

                                            if (newCount > 0) {
                                              displayText += ` (${newCount} new)`;
                                            }

                                            // Check if any take of this content is currently playing
                                            const contentTakesForPlaying = takes.filter(t => t.content_id === c.id);
                                            const isPlaying = contentTakesForPlaying.some(t => t.id === playingTakeId);

                                            const iconColor = isPlaying ? 'common.white' : contentStatus.color;
                                            const contentIcon = sectionType === 'dialogue'
                                              ? <RecordVoiceOverIcon sx={{ fontSize: '0.625rem', color: iconColor }} />
                                              : sectionType === 'music'
                                                ? <MusicNoteIcon sx={{ fontSize: '0.625rem', color: iconColor }} />
                                                : <GraphicEqIcon sx={{ fontSize: '0.625rem', color: iconColor }} />;

                                            return (
                                              <ListItemButton
                                                key={c.id}
                                                sx={{ 
                                                  pl: '3.5rem', 
                                                  py: 0, 
                                                  pr: 0, 
                                                  minHeight: '1.125rem',
                                                  '& .MuiListItemText-root': { margin: 0 },
                                                  '& .MuiListItemIcon-root': { minWidth: 'auto' },
                                                  ...DESIGN_SYSTEM.treeItem
                                                }}
                                                selected={selectedId === nodeKey('content', c.id)}
                                                onClick={() => handleSelect('content', c.id)}
                                              >
                                                <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                                                  {contentIcon}
                                                </ListItemIcon>
                                                <ListItemText 
                                                  primary={displayText} 
                                                  primaryTypographyProps={{ 
                                                    fontSize: '0.9rem',
                                                    lineHeight: '1rem',
                                                    fontWeight: 400,
                                                    color: contentStatus.color
                                                  }} 
                                                />
                                              </ListItemButton>
                                            );
                                          })}
                                      </List>
                                    </Collapse>
                                  </Box>
                                );
                              })}
                            </List>
                          </Collapse>
                        </Box>
                      );
                    })
                  ) : null}
                </List>
              </Collapse>
              )}
            </React.Fragment>
          ));
        })()}
      </List>

      {/* Color Legend at bottom - 2 rows, 2 columns */}
      <Box sx={{ px: '1rem', py: '0.375rem', color: 'text.secondary', borderTop: 1, borderColor: 'divider', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.125rem 0.5rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', lineHeight: 1.1 }}>Complete</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'warning.main' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', lineHeight: 1.1 }}>In Progress</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'error.main' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', lineHeight: 1.1 }}>No Approvals</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'text.disabled' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', lineHeight: 1.1 }}>Not Started</Typography>
        </Box>
      </Box>
    </Box>
  );
}
