import React, { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections, getTakes, deleteSection } from '../api/client.js';

export default function ProjectShell({ blankSpaceConversion, capitalizationConversion, onStatusChange }) {
  const [actors, setActors] = useState([]);
  const [content, setContent] = useState([]);
  const [sections, setSections] = useState([]); // Track sections separately from content
  const [takes, setTakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandNode, setExpandNode] = useState(null);
  const [playingContentId, setPlayingContentId] = useState(null);
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const [audioElement, setAudioElement] = useState(null);

  // Memoize the callback to prevent unnecessary re-renders
  const handleExpandNode = useCallback((expandNodeFunction) => {
    setExpandNode(() => expandNodeFunction);
  }, []);

  const handleStopPlayback = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    setAudioElement(null);
    setPlayingContentId(null);
    setPlayingTakeId(null);
  }, [audioElement]);

  const handlePlayTakeGlobal = useCallback((contentId, take) => {
    // Stop any existing playback first
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    // If the same take is requested again, treat it as a stop toggle
    if (playingContentId === contentId && playingTakeId === take.id) {
      setAudioElement(null);
      setPlayingContentId(null);
      setPlayingTakeId(null);
      return;
    }

    const audioPath = (take.path || '').replace(/\\/g, '/');
    const audio = new Audio(`/media/${audioPath}`);
    audio.onended = () => {
      setAudioElement(null);
      setPlayingContentId(null);
      setPlayingTakeId(null);
    };
    audio.onerror = () => {
      console.error('Failed to play audio:', take.path);
      setAudioElement(null);
      setPlayingContentId(null);
      setPlayingTakeId(null);
    };

    setAudioElement(audio);
    setPlayingContentId(contentId);
    setPlayingTakeId(take.id);
    audio.play().catch((err) => {
      console.error('Failed to play take:', err);
      setAudioElement(null);
      setPlayingContentId(null);
      setPlayingTakeId(null);
    });
  }, [audioElement, playingContentId, playingTakeId]);

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
    <Box component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', minWidth: 0 }}>
      <TreePane
        actors={actors}
        content={content}
        sections={sections}
        takes={takes}
        selectedNode={selectedNode}
        onSelect={setSelectedNode}
        onExpandNode={handleExpandNode}
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
        playingContentId={playingContentId}
        playingTakeId={playingTakeId}
        onPlayRequest={handlePlayTakeGlobal}
        onStopRequest={handleStopPlayback}
      />
    </Box>
  );
}
