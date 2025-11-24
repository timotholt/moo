import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections } from '../api/client.js';

export default function ProjectShell() {
  const [actors, setActors] = useState([]);
  const [content, setContent] = useState([]);
  const [sections, setSections] = useState([]); // Track sections separately from content
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [actorsRes, contentRes, sectionsRes] = await Promise.all([
          getActors(), 
          getContent(), 
          getSections()
        ]);
        if (cancelled) return;
        setActors(actorsRes.actors || []);
        setContent(contentRes.content || []);
        setSections(sectionsRes.sections || []);
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
        selectedNode={selectedNode}
        onSelect={setSelectedNode}
      />
      <DetailPane
        actors={actors}
        content={content}
        sections={sections}
        selectedNode={selectedNode}
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
      />
    </Box>
  );
}
