import React, { useEffect, useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections, getTakes, deleteSection } from '../api/client.js';

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
    <Box ref={containerRef} component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', minWidth: 0, userSelect: isResizing ? 'none' : 'auto' }}>
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
        onActorCreated={(actor) => setActors((prev) => [...prev, actor])}
        onContentCreated={(item) => setContent((prev) => [...prev, item])}
        onSectionCreated={(section) => setSections((prev) => [...prev, section])}
        onActorUpdated={(updatedActor) => {
          setActors((prev) => prev.map(a => a.id === updatedActor.id ? updatedActor : a));
        }}
        onSectionUpdated={(updatedSection) => {
          setSections((prev) => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
        }}
        onActorDeleted={(id) => {
          setActors((prev) => prev.filter((a) => a.id !== id));
          setContent((prev) => prev.filter((c) => c.actor_id !== id));
          setSections((prev) => prev.filter((s) => s.actor_id !== id));
          setSelectedNode(null);
        }}
        onContentDeleted={(id) => {
          setContent((prev) => prev.filter((c) => c.id !== id));
          setSelectedNode(null);
        }}
        onContentUpdated={(updatedContent) => {
          setContent((prev) => prev.map(c => c.id === updatedContent.id ? updatedContent : c));
        }}
        onTakesGenerated={(newTakes) => {
          setTakes((prev) => [...prev, ...newTakes]);
        }}
        onTakeUpdated={(updatedTake) => {
          setTakes((prev) => prev.map(t => t.id === updatedTake.id ? updatedTake : t));
        }}
        onSectionDeleted={async (sectionId) => {
          try {
            const section = sections.find(s => s.id === sectionId);
            await deleteSection(sectionId);
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
            if (section) {
              setContent((prev) => prev.filter((c) => !(c.actor_id === section.actor_id && c.content_type === section.content_type)));
            }
            if (selectedNode?.id === sectionId) setSelectedNode(null);
          } catch (err) {
            setError(err.message || String(err));
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
      />
    </Box>
  );
}
