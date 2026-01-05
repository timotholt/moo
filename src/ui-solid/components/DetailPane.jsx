import { createMemo, Show, Switch, Match } from 'solid-js';
import { Box, Typography } from '@suid/material';
import NoSelectionView from './NoSelectionView.jsx';
import SectionView from './SectionView.jsx';
import ContentView from './ContentView.jsx';
import ProviderDefaultsView from './ProviderDefaultsView.jsx';
import ActorView from './views/ActorView.jsx';
import SceneView from './views/SceneView.jsx';
import RootView from './views/RootView.jsx';
import DefaultsView from './views/DefaultsView.jsx';
import HistoryView from './HistoryView.jsx';
import BrowserConsoleView from './BrowserConsoleView.jsx';
import ViewConfigView from './ViewConfigView.jsx';
import GroupView from './views/GroupView.jsx';
import { PRESET_VIEWS } from '../utils/viewEngine.js';
import { useActorOperations } from '../hooks/useActorOperations.jsx';
import { useSceneOperations } from '../hooks/useSceneOperations.jsx';
import { useDataOperations } from '../hooks/useDataOperations.jsx';

export default function DetailPane(props) {
    const actorOps = useActorOperations({
        onActorCreated: props.onRefresh,
        onActorUpdated: props.onRefresh,
        onActorDeleted: props.onRefresh,
        expandNode: props.onExpandNode
    });

    const sceneOps = useSceneOperations({
        onSceneCreated: props.onRefresh,
        onSceneUpdated: props.onRefresh,
        onSceneDeleted: props.onRefresh,
        expandNode: props.onExpandNode
    });

    const dataOps = useDataOperations({
        actors: props.actors,
        sections: props.sections,
        scenes: props.scenes,
        selectedNode: props.selectedNode,
        expandNode: props.onExpandNode,
        onContentCreated: props.onRefresh,
        onSectionCreated: props.onRefresh,
        onActorUpdated: props.onRefresh,
        onSectionUpdated: props.onRefresh,
        onSectionDeleted: props.onRefresh,
        onSceneUpdated: props.onRefresh,
        deleteActor: actorOps.deleteActor,
        deleteScene: sceneOps.deleteScene
    });

    // Stable type identification to prevent remounts
    const activeType = createMemo(() => props.selectedNode?.type || 'welcome');

    // Resolve entity data based on selection
    const resolvedData = createMemo(() => {
        const node = props.selectedNode;
        if (!node) return null;

        const { type, id } = node;
        switch (type) {
            case 'actor': return { actor: props.actors.find(a => a.id === id) };
            case 'scene': return { scene: props.scenes.find(s => s.id === id) };
            case 'section': {
                const section = props.sections.find(s => s.id === id);
                let owner = null;
                if (section?.owner_type === 'actor') owner = props.actors.find(a => a.id === section.owner_id);
                else if (section?.owner_type === 'scene') owner = props.scenes.find(s => s.id === section.owner_id);
                return { section, owner };
            }
            case 'content': {
                const item = props.content.find(c => c.id === id);
                let owner = null;
                if (item?.owner_type === 'actor') owner = props.actors.find(a => a.id === item.owner_id);
                else if (item?.owner_type === 'scene') owner = props.scenes.find(s => s.id === item.owner_id);
                return { item, owner };
            }
            case 'view-config': {
                const view = props.customViews.find(v => v.id === id) || PRESET_VIEWS[id];
                return { viewData: view };
            }
            case 'view-group': {
                // If it's a known entity group, resolve it
                if (node.field === 'owner_id' || node.field === 'actor_id') {
                    const actor = props.actors.find(a => a.id === node.fieldValue);
                    if (actor) return { actor, typeOverride: 'actor' };
                    const scene = props.data.scenes.find(s => s.id === node.fieldValue);
                    if (scene) return { scene, typeOverride: 'scene' };
                }
                if (node.field === 'scene_id') {
                    const scene = props.scenes.find(s => s.id === node.fieldValue);
                    if (scene) return { scene, typeOverride: 'scene' };
                }
                if (node.field === 'section_id') {
                    const section = props.sections.find(s => s.id === node.fieldValue);
                    if (section) {
                        let owner = null;
                        if (section.owner_type === 'actor') owner = props.actors.find(a => a.id === section.owner_id);
                        else if (section.owner_type === 'scene') owner = props.scenes.find(s => s.id === section.owner_id);
                        return { section, owner, typeOverride: 'section' };
                    }
                }
                return null;
            }
            default: return null;
        }
    });

    const activeViewConfig = createMemo(() => {
        const node = props.selectedNode;
        if (!node) return null;
        if (node.type === 'view-config') return resolvedData()?.viewData;
        if (node.viewId) return props.customViews.find(v => v.id === node.viewId) || PRESET_VIEWS[node.viewId];
        return null;
    });

    const commonError = () => dataOps.error() || actorOps.error() || sceneOps.error();

    return (
        <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Switch fallback={
                <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography color="text.secondary">Select an item to view details.</Typography>
                </Box>
            }>
                <Match when={activeType() === 'welcome'}>
                    <NoSelectionView error={commonError()} />
                </Match>

                <Match when={activeType() === 'root'}>
                    <RootView actorOps={actorOps} sceneOps={sceneOps} error={commonError()} />
                </Match>

                <Match when={activeType() === 'defaults'}>
                    <DefaultsView />
                </Match>

                <Match when={activeType() === 'console'}>
                    <BrowserConsoleView entries={props.consoleEntries} onClear={props.onClearConsole} />
                </Match>

                <Match when={activeType() === 'history'}>
                    <HistoryView logs={props.logs} undoRedo={props.undoRedo} onClearLogs={props.onClearLogs} />
                </Match>

                <Match when={activeType() === 'provider-default'}>
                    <ProviderDefaultsView
                        contentType={props.selectedNode?.id}
                        voices={dataOps.voices}
                        loadingVoices={dataOps.loadingVoices}
                        error={commonError()}
                    />
                </Match>

                {/* Main Entity Redirects */}
                <Match when={activeType() === 'actor' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'actor')}>
                    <ActorView
                        actor={resolvedData()?.actor}
                        sections={props.sections}
                        operations={dataOps}
                        actorOps={actorOps}
                        sceneOps={sceneOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                    />
                </Match>

                <Match when={activeType() === 'scene' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'scene')}>
                    <SceneView
                        scene={resolvedData()?.scene}
                        sections={props.sections}
                        operations={dataOps}
                        actorOps={actorOps}
                        sceneOps={sceneOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                    />
                </Match>

                <Match when={activeType() === 'section' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'section')}>
                    <SectionView
                        sectionData={resolvedData()?.section}
                        owner={resolvedData()?.owner}
                        contentType={resolvedData()?.section?.content_type}
                        operations={dataOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                    />
                </Match>

                <Match when={activeType() === 'content'}>
                    <ContentView
                        item={resolvedData()?.item}
                        owner={resolvedData()?.owner}
                        sections={props.sections}
                        allTakes={props.takes}
                        onContentUpdated={props.onRefresh}
                        onSectionUpdated={props.onRefresh}
                        onActorUpdated={props.onRefresh}
                        onContentDeleted={props.onRefresh}
                        onTakesGenerated={props.onRefresh}
                        onTakeUpdated={props.onRefresh}
                        blankSpaceConversion={props.blankSpaceConversion}
                        capitalizationConversion={props.capitalizationConversion}
                        operations={dataOps}
                        error={commonError()}
                    />
                </Match>

                <Match when={activeType() === 'view-config'}>
                    <ViewConfigView
                        view={resolvedData()?.viewData}
                        onUpdate={(updated) => {
                            const next = props.customViews.some(v => v.id === updated.id)
                                ? props.customViews.map(v => v.id === updated.id ? updated : v)
                                : [...props.customViews, updated];
                            props.onCustomViewsChange(next);
                        }}
                        onDelete={() => {
                            const next = props.customViews.filter(v => v.id !== props.selectedNode.id);
                            props.onCustomViewsChange(next);
                        }}
                        operations={dataOps}
                        actorOps={actorOps}
                        sceneOps={sceneOps}
                    />
                </Match>

                <Match when={activeType() === 'view-group'}>
                    <GroupView
                        groupNode={props.selectedNode}
                        data={{
                            actors: props.actors,
                            sections: props.sections,
                            scenes: props.scenes || [],
                            content: props.content,
                            takes: props.takes
                        }}
                        operations={dataOps}
                        viewConfig={activeViewConfig()}
                    />
                </Match>
            </Switch>
        </Box>
    );
}
