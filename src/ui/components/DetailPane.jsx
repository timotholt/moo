import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NoSelectionView from './NoSelectionView.jsx';
import SectionView from './SectionView.jsx';
import ContentView from './ContentView.jsx';
import ProviderDefaultsView from './ProviderDefaultsView.jsx';
import ActorView from './views/ActorView.jsx';
import RootView from './views/RootView.jsx';
import DefaultsView from './views/DefaultsView.jsx';
import HistoryView from './ConsoleView.jsx';
import BrowserConsoleView from './BrowserConsoleView.jsx';
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
  onTakesGenerated,
  onTakeUpdated,
  blankSpaceConversion,
  capitalizationConversion,
  logs,
  onClearLogs,
  undoRedo,
  consoleEntries,
  onClearConsole
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
      return <NoSelectionView error={commonError} />;

    case 'actor': {
      // Actor can only be completed if all of its sections AND cues are complete
      const actorSections = sections.filter(s => s.actor_id === data.actor.id);
      const actorContent = content.filter(c => c.actor_id === data.actor.id);
      const allSectionsComplete = actorSections.length === 0 || actorSections.every(s => s.section_complete);
      const allCuesComplete = actorContent.length === 0 || actorContent.every(c => c.all_approved);
      const canCompleteActor = allSectionsComplete && allCuesComplete;

      // Determine if this actor is currently the last incomplete actor
      const incompleteActors = actors.filter(a => !a.actor_complete);
      const isLastIncompleteActor =
        incompleteActors.length === 1 && incompleteActors[0].id === data.actor.id;

      return (
        <ActorView 
          actor={data.actor}
          sections={sections}
          actorOps={actorOps}
          dataOps={dataOps}
          error={commonError}
          canCompleteActor={canCompleteActor}
          isLastIncompleteActor={isLastIncompleteActor}
        />
      );
    }

    case 'section': {
      if (!data.sectionData || !data.actor) {
        return (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
            <Typography color="error">Section or actor not found.</Typography>
          </Box>
        );
      }

      // Section can only be completed if all of its cues are complete
      const sectionContent = content.filter(c => c.section_id === data.sectionData.id);
      const canCompleteSection = sectionContent.length === 0 || sectionContent.every(c => c.all_approved);

      return (
        <SectionView
          sectionData={data.sectionData}
          actor={data.actor}
          contentType={data.contentType}
          voices={dataOps.voices}
          loadingVoices={dataOps.loadingVoices}
          contentPrompt={dataOps.contentPrompt}
          contentCueId={dataOps.contentCueId}
          creatingContent={dataOps.creatingContent}
          onContentPromptChange={(e) => dataOps.setContentPrompt(e.target.value)}
          onContentCueIdChange={(e) => dataOps.setContentCueId(e.target.value)}
          onCreateContent={dataOps.createContent}
          onUpdateSectionName={dataOps.updateSectionName}
          onUpdateProviderSettings={dataOps.updateProviderSettings}
          sectionComplete={data.sectionData.section_complete}
          onToggleSectionComplete={dataOps.toggleSectionComplete}
          onDeleteSection={() => onSectionDeleted && onSectionDeleted(data.sectionData.id)}
          error={commonError}
          canCompleteSection={canCompleteSection}
        />
      );
    }

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
          key={data.item.id}
          item={data.item}
          actor={contentActor}
          sections={sections}
          onContentDeleted={onContentDeleted}
          onContentUpdated={onContentUpdated}
          onSectionUpdated={onSectionUpdated}
          onActorUpdated={onActorUpdated}
          sectionComplete={contentSectionComplete}
          blankSpaceConversion={blankSpaceConversion}
          capitalizationConversion={capitalizationConversion}
          onTakesGenerated={onTakesGenerated}
          onTakeUpdated={onTakeUpdated}
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

    case 'console':
      return (
        <BrowserConsoleView 
          entries={consoleEntries}
          onClear={onClearConsole}
        />
      );

    case 'history':
      return (
        <HistoryView 
          logs={logs}
          undoRedo={undoRedo}
          onClearLogs={onClearLogs}
        />
      );

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
