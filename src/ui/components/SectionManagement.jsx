import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

export default function SectionManagement({ 
  actor, 
  sections, 
  onCreateSection, 
  creatingContent 
}) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.95rem' }}>
        Content Sections
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.8rem' }}>
        Create multiple sections for different types of content (e.g., Combat Dialog, Story Music, etc.)
      </Typography>
      
      <Stack spacing={2} sx={{ mt: 2 }}>
        {/* Show existing sections categorized by type */}
        {['dialogue', 'music', 'sfx'].map(contentType => {
          const sectionsOfType = sections.filter(s => s.actor_id === actor.id && s.content_type === contentType);
          if (sectionsOfType.length === 0) return null;
          
          return (
            <Box key={contentType}>
              <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>
                {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Sections:
              </Typography>
              {sectionsOfType.map(section => (
                <Box key={section.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 2 }}>
                  <Typography variant="body2" sx={{ minWidth: 120, fontSize: '0.8rem' }}>
                    {section.name || section.content_type.toUpperCase()}
                  </Typography>
                  <Typography variant="body2" color="success.main" sx={{ fontSize: '0.8rem' }}>
                    ✓ Section exists
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        })}
        
        {/* Add new section buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'dialogue')}
            disabled={creatingContent}
            sx={{ fontSize: '0.75rem' }}
          >
            + Add Dialogue Section
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'music')}
            disabled={creatingContent}
            sx={{ fontSize: '0.75rem' }}
          >
            + Add Music Section
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onCreateSection(actor.id, 'sfx')}
            disabled={creatingContent}
            sx={{ fontSize: '0.75rem' }}
          >
            + Add SFX Section
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
