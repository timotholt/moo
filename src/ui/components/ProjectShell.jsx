import React, { useEffect, useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections, getTakes, deleteSection } from '../api/client.js';
import { useAppLog } from '../hooks/useAppLog.js';
import { useUndoStack } from '../hooks/useUndoStack.js';

export default function ProjectShell({ blankSpaceConversion, capitalizationConversion, onStatusChange, onCreditsRefresh, onPlayTake, onStopPlayback, currentPlayingTakeId }) {
  const [actors, setActors] = useState([]);
  const [content, setContent] = useState([]);
  const [sections, setSections] = useState([]); // Track sections separately from content
  const [takes, setTakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandNode, setExpandNode] = useState(null);
  const [playedTakes, setPlayedTakes] = useState(() => {
    try {
      const saved = localStorage.getItem('audiomanager-played-takes');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('Failed to load played takes from localStorage:', e);
      return {};
    }
  });

  // Resizable tree pane width
  const [treePaneWidth, setTreePaneWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('audiomanager-tree-pane-width');
      return saved ? parseInt(saved, 10) : 300;
    } catch (e) {
      return 300;
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  // Application logging (persisted to server)
  const { logs, loading: logsLoading, logInfo, logSuccess, logError, logWarning, clearLogs, reloadLogs } = useAppLog();

  // Handle state restored from undo
  const handleStateRestored = useCallback((restoredState) => {
    setActors(restoredState.actors);
    setSections(restoredState.sections);
    setContent(restoredState.content);
    setSelectedNode(null);
    logInfo(restoredState.message);
  }, [logInfo]);

  // Snapshot-based undo stack
  const undoStack = useUndoStack({
    onStateRestored: handleStateRestored,
  });

  // Memoize the callback to prevent unnecessary re-renders
  const handleExpandNode = useCallback((expandNodeFunction) => {
    setExpandNode(() => expandNodeFunction);
  }, []);

  const handlePlayTakeGlobal = useCallback((contentId, take) => {
    // Mark as played and delegate to global player
    setPlayedTakes((prev) => ({ ...prev, [take.id]: true }));
    if (onPlayTake) {
      onPlayTake(take);
    }
  }, [onPlayTake]);

  useEffect(() => {
    try {
      localStorage.setItem('audiomanager-played-takes', JSON.stringify(playedTakes));
    } catch (e) {
      console.warn('Failed to save played takes to localStorage:', e);
    }
  }, [playedTakes]);

  // Save tree pane width to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('audiomanager-tree-pane-width', String(treePaneWidth));
    } catch (e) {
      console.warn('Failed to save tree pane width:', e);
    }
  }, [treePaneWidth]);

  // Handle resize drag
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      // Clamp between 200 and 500 pixels
      setTreePaneWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [actorsRes, contentRes, sectionsRes, takesRes] = await Promise.all([
          getActors(), 
          getContent(), 
          getSections(),
          getTakes()
        ]);
        if (cancelled) return;
        setActors(actorsRes.actors || []);
        setContent(contentRes.content || []);
        setSections(sectionsRes.sections || []);
        setTakes(takesRes.takes || []);
        setError(null);
        // Refresh undo state and logs after project data loads
        undoStack.refreshUndoState();
        reloadLogs();
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Box component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body1">Loading project data…</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">Error loading data: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box ref={containerRef} component="main" sx={{ flexGrow: 1, pt: 6, pb: '6rem', display: 'flex', minWidth: 0, userSelect: isResizing ? 'none' : 'auto' }}>
      <TreePane
        width={treePaneWidth}
        actors={actors}
        content={content}
        sections={sections}
        takes={takes}
        selectedNode={selectedNode}
        onSelect={setSelectedNode}
        onExpandNode={handleExpandNode}
        playingTakeId={currentPlayingTakeId}
        playedTakes={playedTakes}
      />
      {/* Resizable divider */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          width: '6px',
          cursor: 'col-resize',
          backgroundColor: isResizing ? 'primary.main' : 'transparent',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          flexShrink: 0,
          zIndex: 1,
        }}
      />
      <DetailPane
        actors={actors}
        content={content}
        sections={sections}
        selectedNode={selectedNode}
        expandNode={expandNode}
        onActorCreated={(actor) => {
          setActors((prev) => [...prev, actor]);
          logInfo(`Created: Actors → ${actor.display_name}`);
          undoStack.refreshUndoState();
        }}
        onContentCreated={(item) => {
          setContent((prev) => [...prev, item]);
          // Build path: Actor → Section → Cue
          const itemActor = actors.find(a => a.id === item.actor_id);
          const itemSection = sections.find(s => s.id === item.section_id);
          const actorName = itemActor?.display_name || 'Unknown';
          const sectionName = itemSection?.name || item.content_type;
          logInfo(`Created: Actors → ${actorName} → ${sectionName} → ${item.cue_id}`);
          undoStack.refreshUndoState();
        }}
        onSectionCreated={(section) => {
          setSections((prev) => [...prev, section]);
          const sectionActor = actors.find(a => a.id === section.actor_id);
          const actorName = sectionActor?.display_name || 'Unknown';
          const sectionName = section.name || section.content_type;
          logInfo(`Created: Actors → ${actorName} → ${sectionName}`);
          undoStack.refreshUndoState();
        }}
        onActorUpdated={(updatedActor, oldName) => {
          setActors((prev) => prev.map(a => a.id === updatedActor.id ? updatedActor : a));
          if (oldName && oldName !== updatedActor.display_name) {
            logInfo(`Renamed: Actors → ${oldName} → ${updatedActor.display_name}`);
            undoStack.refreshUndoState();
          }
        }}
        onSectionUpdated={(updatedSection, oldName) => {
          setSections((prev) => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
          if (oldName && oldName !== updatedSection.name) {
            const sectionActor = actors.find(a => a.id === updatedSection.actor_id);
            const actorName = sectionActor?.display_name || 'Unknown';
            logInfo(`Renamed: Actors → ${actorName} → ${oldName} → ${updatedSection.name}`);
            undoStack.refreshUndoState();
          }
        }}
        onActorDeleted={(id) => {
          const actor = actors.find(a => a.id === id);
          setActors((prev) => prev.filter((a) => a.id !== id));
          setContent((prev) => prev.filter((c) => c.actor_id !== id));
          setSections((prev) => prev.filter((s) => s.actor_id !== id));
          setSelectedNode(null);
          logInfo(`Deleted: Actors → ${actor?.display_name || id}`);
          undoStack.refreshUndoState();
        }}
        onContentDeleted={(id) => {
          const item = content.find(c => c.id === id);
          const itemActor = actors.find(a => a.id === item?.actor_id);
          const itemSection = sections.find(s => s.id === item?.section_id);
          const actorName = itemActor?.display_name || 'Unknown';
          const sectionName = itemSection?.name || item?.content_type || 'Unknown';
          setContent((prev) => prev.filter((c) => c.id !== id));
          setSelectedNode(null);
          logInfo(`Deleted: Actors → ${actorName} → ${sectionName} → ${item?.cue_id || id}`);
          undoStack.refreshUndoState();
        }}
        onContentUpdated={(updatedContent, oldCueId) => {
          setContent((prev) => prev.map(c => c.id === updatedContent.id ? updatedContent : c));
          if (oldCueId && oldCueId !== updatedContent.cue_id) {
            const itemActor = actors.find(a => a.id === updatedContent.actor_id);
            const itemSection = sections.find(s => s.id === updatedContent.section_id);
            const actorName = itemActor?.display_name || 'Unknown';
            const sectionName = itemSection?.name || updatedContent.content_type;
            logInfo(`Renamed: Actors → ${actorName} → ${sectionName} → ${oldCueId} → ${updatedContent.cue_id}`);
            undoStack.refreshUndoState();
          }
        }}
        onTakesGenerated={(newTakes) => {
          setTakes((prev) => [...prev, ...newTakes]);
          if (newTakes.length > 0) {
            const take = newTakes[0];
            const takeContent = content.find(c => c.id === take.content_id);
            const takeActor = actors.find(a => a.id === takeContent?.actor_id);
            const takeSection = sections.find(s => s.id === takeContent?.section_id);
            const actorName = takeActor?.display_name || 'Unknown';
            const sectionName = takeSection?.name || takeContent?.content_type || 'Unknown';
            const cueName = takeContent?.cue_id || 'Unknown';
            logSuccess(`Generated ${newTakes.length} take(s): Actors → ${actorName} → ${sectionName} → ${cueName}`);
          }
        }}
        onTakeUpdated={(updatedTake) => {
          setTakes((prev) => prev.map(t => t.id === updatedTake.id ? updatedTake : t));
        }}
        onSectionDeleted={async (sectionId) => {
          try {
            const section = sections.find(s => s.id === sectionId);
            const actor = actors.find(a => a.id === section?.actor_id);
            const sectionName = section?.name || section?.content_type || 'Unknown';
            const actorName = actor?.display_name || 'Unknown';
            await deleteSection(sectionId);
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
            // Only delete content belonging to THIS specific section
            setContent((prev) => prev.filter((c) => c.section_id !== sectionId));
            if (selectedNode?.id === sectionId) setSelectedNode(null);
            logInfo(`Deleted: Actors → ${actorName} → ${sectionName}`);
            undoStack.refreshUndoState();
          } catch (err) {
            setError(err.message || String(err));
            logError(`Failed to delete section: ${err.message || err}`);
          }
        }}
        blankSpaceConversion={blankSpaceConversion}
        capitalizationConversion={capitalizationConversion}
        onStatusChange={onStatusChange}
        playingTakeId={currentPlayingTakeId}
        onPlayRequest={handlePlayTakeGlobal}
        onStopRequest={onStopPlayback}
        playedTakes={playedTakes}
        onTakePlayed={(takeId) => setPlayedTakes((prev) => ({ ...prev, [takeId]: true }))}
        onCreditsRefresh={onCreditsRefresh}
        logs={logs}
        onClearLogs={clearLogs}
        onLogError={logError}
        onLogInfo={logInfo}
        canUndo={undoStack.canUndo}
        lastUndoTimestamp={undoStack.lastTimestamp}
        onUndo={undoStack.undo}
        undoing={undoStack.undoing}
      />
    </Box>
  );
}
