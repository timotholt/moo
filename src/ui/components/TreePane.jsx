import React, { useState } from 'react';
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

function getContentStatusColor(content) {
  // RED: Missing item_id OR missing prompt (can't generate)
  if (!content.item_id?.trim() || !content.prompt?.trim()) {
    return 'error.main';
  }
  
  // GREEN: Complete and approved
  if (content.all_approved) {
    return 'success.main';
  }
  
  // YELLOW: Has item_id and prompt but needs approval
  return 'warning.main';
}

export default function TreePane({ actors, content, sections, selectedNode, onSelect }) {
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

  return (
    <Box
      sx={{
        width: { xs: 260, md: 300 },
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        pt: 1,
      }}
    >
      <Typography variant="subtitle2" sx={{ px: 2, pb: 1, fontSize: '0.85rem' }}>
        Project
      </Typography>
      
      {/* Color Legend */}
      <Box sx={{ px: 2, pb: 1, fontSize: '0.7rem', color: 'text.secondary' }}>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>
          Content Status:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Missing</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Review</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Approved</Typography>
          </Box>
        </Box>
      </Box>
      
      <List dense disablePadding sx={{ px: 0.5, pb: 1 }}>
        {/* Render sections in order: Defaults first, then alphabetically */}
        {(() => {
          // Define all available sections with their properties
          const allSections = [
            {
              id: 'defaults',
              name: 'Defaults',
              icon: <SettingsIcon fontSize="small" />,
              nodeType: 'defaults',
              nodeId: 'providers',
              order: 0, // Always first
              children: ['dialogue', 'music', 'sfx'].map((type) => ({
                id: type,
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} (ElevenLabs)`,
                icon: type === 'dialogue' ? <RecordVoiceOverIcon fontSize="small" /> :
                      type === 'music' ? <MusicNoteIcon fontSize="small" /> : <GraphicEqIcon fontSize="small" />,
                nodeType: 'provider-default',
                nodeId: type
              }))
            },
            {
              id: 'actors',
              name: 'Actors',
              icon: <PersonIcon fontSize="small" />,
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
                selected={selectedId === nodeKey(section.nodeType, section.nodeId)}
                onClick={() => handleSelect(section.nodeType, section.nodeId)}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {section.icon}
                </ListItemIcon>
                <ListItemText primary={section.name} primaryTypographyProps={{ fontSize: '0.9rem' }} />
                <Box onClick={(e) => { e.stopPropagation(); handleToggle(section.id); }}>
                  {expanded[section.id] ? <ExpandLess /> : <ExpandMore />}
                </Box>
              </ListItemButton>

              <Collapse in={expanded[section.id]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {section.children ? (
                    // Render predefined children (like provider defaults)
                    section.children.map((child) => (
                      <ListItemButton
                        key={child.id}
                        sx={{ pl: 4, py: 0.25 }}
                        selected={selectedId === nodeKey(child.nodeType, child.nodeId)}
                        onClick={() => handleSelect(child.nodeType, child.nodeId)}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {child.icon}
                        </ListItemIcon>
                        <ListItemText primary={child.name} primaryTypographyProps={{ fontSize: '0.8rem' }} />
                      </ListItemButton>
                    ))
                  ) : section.id === 'actors' ? (
                    // Special handling for actors section
                    actors.map((actor) => {
                      const actorKey = `actor-${actor.id}`;
                      return (
                        <Box key={actor.id}>
                          <ListItemButton
                            sx={{ pl: 4, py: 0.5 }}
                            selected={selectedId === nodeKey('actor', actor.id)}
                            onClick={() => handleSelect('actor', actor.id)}
                          >
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <PersonIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary={actor.display_name} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                            <Box onClick={(e) => { e.stopPropagation(); handleToggle(actorKey); }}>
                              {expanded[actorKey] ? <ExpandLess /> : <ExpandMore />}
                            </Box>
                          </ListItemButton>

                          <Collapse in={expanded[actorKey]} timeout="auto" unmountOnExit>
                            <List component="div" disablePadding>
                              {sections.filter(s => s.actor_id === actor.id).map((sectionItem) => {
                                const section = sectionItem.content_type;

                                const sectionIcon = section === 'dialogue' ? <RecordVoiceOverIcon fontSize="small" /> :
                                                  section === 'music' ? <MusicNoteIcon fontSize="small" /> : <GraphicEqIcon fontSize="small" />;
                                const sectionKey = `section-${sectionItem.id}`;
                                
                                // Use the section item for custom name
                                const displayName = sectionItem?.name || section.toUpperCase();

                                return (
                                  <Box key={sectionItem.id}>
                                    <ListItemButton
                                      sx={{ pl: 6, py: 0.25 }}
                                      selected={selectedId === nodeKey(`${section}-section`, sectionItem.id)}
                                      onClick={() => handleSelect(`${section}-section`, sectionItem.id)}
                                    >
                                      <ListItemIcon sx={{ minWidth: 24 }}>
                                        {sectionIcon}
                                      </ListItemIcon>
                                      <ListItemText primary={displayName} primaryTypographyProps={{ fontSize: '0.8rem' }} />
                                      <Box onClick={(e) => { e.stopPropagation(); handleToggle(sectionKey); }}>
                                        {expanded[sectionKey] ? <ExpandLess /> : <ExpandMore />}
                                      </Box>
                                    </ListItemButton>

                                    <Collapse in={expanded[sectionKey]} timeout="auto" unmountOnExit>
                                      <List component="div" disablePadding>
                                        {content
                                          .filter((c) => c.actor_id === actor.id && c.content_type === section)
                                          .map((c) => {
                                            const statusColor = getContentStatusColor(c);
                                            return (
                                              <ListItemButton
                                                key={c.id}
                                                sx={{ pl: 8, py: 0.125 }}
                                                selected={selectedId === nodeKey('content', c.id)}
                                                onClick={() => handleSelect('content', c.id)}
                                              >
                                                <ListItemIcon sx={{ minWidth: 20 }}>
                                                  <DescriptionIcon fontSize="small" sx={{ color: statusColor }} />
                                                </ListItemIcon>
                                                <ListItemText 
                                                  primary={c.item_id || c.id} 
                                                  primaryTypographyProps={{ 
                                                    fontSize: '0.75rem',
                                                    color: statusColor
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
