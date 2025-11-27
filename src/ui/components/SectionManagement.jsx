import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

export default function SectionManagement({ 
  actor, 
  sections, 
  onCreateSection, 
  creatingContent 
}) {
  return (
    <Box sx={{ mt: DESIGN_SYSTEM.spacing.sectionGap }}>
      <Typography variant="subtitle2" gutterBottom sx={DESIGN_SYSTEM.typography.sectionTitle}>
        Content Sections
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={DESIGN_SYSTEM.typography.body}>
        Create multiple sections for different types of content (e.g., Combat Dialog, Story Music, etc.)
      </Typography>
      
      <Stack spacing={DESIGN_SYSTEM.spacing.elementGap} sx={{ mt: DESIGN_SYSTEM.spacing.elementGap }}>
        {/* Show existing sections categorized by type */}
        {['dialogue', 'music', 'sfx'].map(contentType => {
          const sectionsOfType = sections.filter(s => s.actor_id === actor.id && s.content_type === contentType);
          if (sectionsOfType.length === 0) return null;
          
          return (
            <Box key={contentType}>
              <Typography variant="body2" sx={{ ...DESIGN_SYSTEM.typography.body, fontWeight: 500, mb: DESIGN_SYSTEM.spacing.tightGap }}>
                {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Sections:
              </Typography>
              {sectionsOfType.map(section => (
                <Box key={section.id} sx={{ display: 'flex', alignItems: 'center', gap: DESIGN_SYSTEM.spacing.elementGap, ml: DESIGN_SYSTEM.spacing.elementGap }}>
                  <Typography variant="body2" sx={{ minWidth: 120, ...DESIGN_SYSTEM.typography.body }}>
                    {section.name || section.content_type.toUpperCase()}
                  </Typography>
                  <Typography variant="body2" color="success.main" sx={DESIGN_SYSTEM.typography.body}>
                    ✓ Section exists
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        })}
        
        {/* Add new section buttons */}
        <Box sx={{ display: 'flex', gap: DESIGN_SYSTEM.spacing.componentGap, flexWrap: 'wrap', mt: DESIGN_SYSTEM.spacing.elementGap }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'dialogue')}
            disabled={creatingContent}
            sx={DESIGN_SYSTEM.typography.small}
          >
            + Add Dialogue Section
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'music')}
            disabled={creatingContent}
            sx={DESIGN_SYSTEM.typography.small}
          >
            + Add Music Section
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'sfx')}
            disabled={creatingContent}
            sx={DESIGN_SYSTEM.typography.small}
          >
            + Add SFX Section
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
