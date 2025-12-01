import { useMemo } from 'react';

interface SelectedNode {
  type: string;
  id: string;
}

interface Actor {
  id: string;
  display_name: string;
  actor_complete?: boolean;
  [key: string]: unknown;
}

interface Section {
  id: string;
  actor_id: string;
  content_type: string;
  section_complete?: boolean;
  [key: string]: unknown;
}

interface Content {
  id: string;
  actor_id: string;
  section_id: string;
  [key: string]: unknown;
}

interface UseViewRouterProps {
  selectedNode: SelectedNode | null;
  actors: Actor[];
  content: Content[];
  sections: Section[];
}

type ViewType = 'welcome' | 'actor' | 'section' | 'content' | 'provider-default' | 'defaults' | 'root' | 'console' | 'history' | 'fallback';

interface ViewRouterResult {
  view: ViewType;
  data?: {
    actor?: Actor;
    sectionData?: Section;
    contentType?: string;
    item?: Content;
  };
}

export function useViewRouter({ selectedNode, actors, content, sections }: UseViewRouterProps): ViewRouterResult {
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
      const actor = sectionData ? actors.find((a) => a.id === sectionData.actor_id) : undefined;
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

    if (selectedNode.type === 'console') {
      return { view: 'console' };
    }

    if (selectedNode.type === 'history') {
      return { view: 'history' };
    }

    return { view: 'fallback' };
  }, [selectedNode, actors, content, sections]);
}
