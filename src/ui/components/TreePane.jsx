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
    c => c.actor_id === sectionItem.actor_id && c.content_type === sectionItem.content_type
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

export default function TreePane({ width, actors, content, sections, takes = [], selectedNode, onSelect, onExpandNode, playingContentId, playedTakes = {} }) {
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
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '100%',
        pt: '0.625rem',
      }}
    >
      <Typography variant="subtitle2" sx={{ px: '1.25rem', pb: '0.625rem', fontSize: '0.85rem' }}>
        Project
      </Typography>
      
      {/* Color Legend */}
      <Box sx={{ px: '1.25rem', pb: '0.625rem', fontSize: '0.7rem', color: 'text.secondary' }}>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', display: 'block', mb: '0.3125rem' }}>
          Status:
        </Typography>
        <Box sx={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.3125rem' }}>
            <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'text.disabled' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Not Started</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.3125rem' }}>
            <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'error.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>No Approvals</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.3125rem' }}>
            <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'warning.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>In Progress</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.3125rem' }}>
            <Box sx={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', bgcolor: 'success.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Complete</Typography>
          </Box>
        </Box>
      </Box>
      
      <List dense disablePadding sx={{ px: '0.3125rem', pb: '0.625rem' }}>
        {/* Render sections in order: Defaults first, then alphabetically */}
        {(() => {
          // Define all available sections with their properties
          const allSections = [
            {
              id: 'defaults',
              name: 'Defaults',
              icon: <SettingsIcon sx={{ fontSize: '0.875rem' }} />,
              nodeType: 'defaults',
              nodeId: 'providers',
              order: 0, // Always first
              children: ['dialogue', 'music', 'sfx'].map((type) => ({
                id: type,
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} (ElevenLabs)`,
                icon: type === 'dialogue' ? <RecordVoiceOverIcon sx={{ fontSize: '0.75rem' }} /> :
                      type === 'music' ? <MusicNoteIcon sx={{ fontSize: '0.75rem' }} /> : <GraphicEqIcon sx={{ fontSize: '0.75rem' }} />,
                nodeType: 'provider-default',
                nodeId: type
              }))
            },
            {
              id: 'actors',
              name: 'Actors',
              icon: <PersonIcon sx={{ fontSize: '0.875rem' }} />,
              nodeType: 'root',
              nodeId: 'project',
              order: 1, // Alphabetical after Defaults
              children: null // Special handling for actors
            }
            // Future sections like 'Master', 'Templates', etc. can be added here
            // They will automatically sort alphabetically after Defaults
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
                  '& .MuiListItemIcon-root': { minWidth: 'auto' }
                }}
                selected={selectedId === nodeKey(section.nodeType, section.nodeId)}
                onClick={() => handleSelect(section.nodeType, section.nodeId)}
              >
                <ListItemIcon sx={{ minWidth: 'auto', mr: '0.25rem' }}>
                  {section.icon}
                </ListItemIcon>
                <ListItemText primary={section.name} primaryTypographyProps={{ fontSize: '0.9rem', lineHeight: '1rem' }} />
                <Box onClick={(e) => { e.stopPropagation(); handleToggle(section.id); }} sx={{ display: 'flex', alignItems: 'center', p: 0, m: 0 }}>
                  {expanded[section.id] ? <ExpandLess sx={{ fontSize: '0.75rem' }} /> : <ExpandMore sx={{ fontSize: '0.75rem' }} />}
                </Box>
              </ListItemButton>

              <Collapse in={expanded[section.id]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {section.children ? (
                    // Render predefined children (like provider defaults)
                    section.children.map((child) => (
                      <ListItemButton
                        key={child.id}
                        sx={{ 
                          pl: '1.75rem', 
                          py: 0, 
                          pr: 0, 
                          minHeight: '1.125rem',
                          '& .MuiListItemText-root': { margin: 0 },
                          '& .MuiListItemIcon-root': { minWidth: 'auto' }
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
                              pl: '1.75rem', 
                              py: 0, 
                              pr: 0, 
                              minHeight: '1.125rem',
                              '& .MuiListItemText-root': { margin: 0 },
                              '& .MuiListItemIcon-root': { minWidth: 'auto' }
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
                                        pl: '3rem', 
                                        py: 0, 
                                        pr: 0, 
                                        minHeight: '1.125rem',
                                        '& .MuiListItemText-root': { margin: 0 },
                                        '& .MuiListItemIcon-root': { minWidth: 'auto' }
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
                                          .filter((c) => c.actor_id === actor.id && c.content_type === sectionType)
                                          .map((c) => {
                                            const contentStatus = getContentStatus(c, takes);
                                            const contentTakes = takes.filter(t => t.content_id === c.id);
                                            const newCount = contentTakes.filter(t => t.status === 'new' && !playedTakes[t.id]).length;

                                            let displayText = contentStatus.approvedCount > 0 
                                              ? `${c.item_id || c.id} (${contentStatus.approvedCount})`
                                              : (c.item_id || c.id);

                                            if (newCount > 0) {
                                              displayText += ` (${newCount} new)`;
                                            }

                                            const isPlaying = playingContentId === c.id;

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
                                                  pl: '4.25rem', 
                                                  py: 0, 
                                                  pr: 0, 
                                                  minHeight: '1.125rem',
                                                  '& .MuiListItemText-root': { margin: 0 },
                                                  '& .MuiListItemIcon-root': { minWidth: 'auto' }
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
            </React.Fragment>
          ));
        })()}
      </List>
    </Box>
  );
}
