import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WelcomeScreen from './WelcomeScreen.jsx';
import SectionView from './SectionView.jsx';
import ContentView from './ContentView.jsx';
import ProviderDefaultsView from './ProviderDefaultsView.jsx';
import ActorView from './views/ActorView.jsx';
import RootView from './views/RootView.jsx';
import DefaultsView from './views/DefaultsView.jsx';
import { useActorOperations } from '../hooks/useActorOperations.js';
import { useDataOperations } from '../hooks/useDataOperations.js';
import { useViewRouter } from '../hooks/useViewRouter.js';

export default function DetailPane({ 
  actors, 
  content, 
  sections, 
  selectedNode, 
  expandNode, 
  onActorCreated, 
  onContentCreated, 
  onActorDeleted, 
  onContentDeleted, 
  onSectionCreated, 
  onActorUpdated, 
  onSectionUpdated,
  onContentUpdated,
  onSectionDeleted,
  blankSpaceConversion,
  capitalizationConversion 
}) {
  const actorOps = useActorOperations({ 
    onActorCreated, 
    onActorUpdated, 
    onActorDeleted, 
    expandNode 
  });
  
  const dataOps = useDataOperations({ 
    actors, 
    sections, 
    selectedNode, 
    expandNode, 
    onContentCreated, 
    onSectionCreated, 
    onActorUpdated, 
    onSectionUpdated 
  });

  const { view, data } = useViewRouter({ selectedNode, actors, content, sections });

  const commonError = dataOps.error || actorOps.error;

  switch (view) {
    case 'welcome':
      return <WelcomeScreen error={commonError} />;

    case 'actor':
      return (
        <ActorView 
          actor={data.actor}
          sections={sections}
          actorOps={actorOps}
          dataOps={dataOps}
          error={commonError}
        />
      );

    case 'section':
      if (!data.sectionData || !data.actor) {
        return (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
            <Typography color="error">Section or actor not found.</Typography>
          </Box>
        );
      }
      // Check if all content in this section is complete
      const sectionContent = content.filter(c => 
        c.actor_id === data.actor.id && c.content_type === data.contentType
      );
      const sectionComplete = sectionContent.length > 0 && sectionContent.every(c => c.all_approved);
      
      return (
        <SectionView
          sectionData={data.sectionData}
          actor={data.actor}
          contentType={data.contentType}
          voices={dataOps.voices}
          loadingVoices={dataOps.loadingVoices}
          contentPrompt={dataOps.contentPrompt}
          contentItemId={dataOps.contentItemId}
          creatingContent={dataOps.creatingContent}
          onContentPromptChange={(e) => dataOps.setContentPrompt(e.target.value)}
          onContentItemIdChange={(e) => dataOps.setContentItemId(e.target.value)}
          onCreateContent={dataOps.createContent}
          onUpdateSectionName={dataOps.updateSectionName}
          onUpdateProviderSettings={dataOps.updateProviderSettings}
          sectionComplete={sectionComplete}
          onToggleSectionComplete={(complete) => {
            // Toggle all_approved on all content in this section
            // For now, this is a UI-only indicator based on content approval status
            console.log('Section complete toggle:', complete);
          }}
          onDeleteSection={() => onSectionDeleted && onSectionDeleted(data.sectionData.id)}
          error={commonError}
        />
      );

    case 'content':
      if (!data.item) {
        return (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
            <Typography color="error">Content item not found.</Typography>
          </Box>
        );
      }
      // Check if the section containing this content is complete
      const contentSectionComplete = data.item.all_approved;
      // Find the actor for this content to get base_filename
      const contentActor = actors.find(a => a.id === data.item.actor_id);
      
      return (
        <ContentView 
          item={data.item}
          actor={contentActor}
          onContentDeleted={onContentDeleted}
          onContentUpdated={onContentUpdated}
          sectionComplete={contentSectionComplete}
          blankSpaceConversion={blankSpaceConversion}
          capitalizationConversion={capitalizationConversion}
          error={commonError}
        />
      );

    case 'provider-default':
      return (
        <ProviderDefaultsView 
          contentType={data.contentType}
          voices={dataOps.voices}
          loadingVoices={dataOps.loadingVoices}
          error={commonError}
        />
      );

    case 'defaults':
      return <DefaultsView />;

    case 'root':
      return <RootView actorOps={actorOps} error={commonError} />;

    default:
      return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
          <Typography color="text.secondary">
            Select an item from the tree to view details.
          </Typography>
        </Box>
      );
  }
}
