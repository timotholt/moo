import { useMemo } from 'react';

export function useViewRouter({ selectedNode, actors, content, sections }) {
  return useMemo(() => {
    if (!selectedNode) {
      return { view: 'welcome' };
    }

    if (selectedNode.type === 'actor') {
      const actor = actors.find((a) => a.id === selectedNode.id);
      return { view: 'actor', data: { actor } };
    }

    if (selectedNode.type.endsWith('-section')) {
      const contentType = selectedNode.type.replace('-section', '');
      const sectionData = sections.find(s => s.id === selectedNode.id);
      const actor = sectionData ? actors.find((a) => a.id === sectionData.actor_id) : null;
      return { view: 'section', data: { sectionData, actor, contentType } };
    }

    if (selectedNode.type === 'content') {
      const item = content.find((c) => c.id === selectedNode.id);
      return { view: 'content', data: { item } };
    }

    if (selectedNode.type === 'provider-default') {
      return { view: 'provider-default', data: { contentType: selectedNode.id } };
    }

    if (selectedNode.type === 'defaults') {
      return { view: 'defaults' };
    }

    if (selectedNode.type === 'root') {
      return { view: 'root' };
    }

    return { view: 'fallback' };
  }, [selectedNode, actors, content, sections]);
}
