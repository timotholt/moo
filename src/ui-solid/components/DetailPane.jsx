import { createMemo, Show, Switch, Match } from 'solid-js';
import { Box, Typography } from '@suid/material';
import NoSelectionView from './NoSelectionView.jsx';
import BinView from './BinView.jsx';
import MediaView from './MediaView.jsx';
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
import { useGlobalDefaults } from '../hooks/useGlobalDefaults.jsx';

export default function DetailPane(props) {
    const globalDefaults = useGlobalDefaults();

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
        bins: props.bins,
        scenes: props.scenes,
        selectedNode: props.selectedNode,
        expandNode: props.onExpandNode,
        onMediaCreated: props.onRefresh,
        onBinCreated: props.onRefresh,
        onActorUpdated: props.onRefresh,
        onBinUpdated: props.onRefresh,
        onBinDeleted: props.onRefresh,
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
            case 'bin': {
                const bin = props.bins.find(b => b.id === id);
                let owner = null;
                if (bin?.owner_type === 'actor') owner = props.actors.find(a => a.id === bin.owner_id);
                else if (bin?.owner_type === 'scene') owner = props.scenes.find(s => s.id === bin.owner_id);
                return { bin, owner };
            }
            case 'media': {
                const item = props.media.find(m => m.id === id);
                let owner = null;
                if (item?.owner_type === 'actor') owner = props.actors.find(a => a.id === item.owner_id);
                else if (item?.owner_type === 'scene') owner = props.scenes.find(s => s.id === item.owner_id);
                const bin = item?.bin_id ? props.bins.find(b => b.id === item.bin_id) : null;
                return { item, owner, bin };
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
                    const scene = props.scenes.find(s => s.id === node.fieldValue);
                    if (scene) return { scene, typeOverride: 'scene' };
                }
                if (node.field === 'scene_id') {
                    const scene = props.scenes.find(s => s.id === node.fieldValue);
                    if (scene) return { scene, typeOverride: 'scene' };
                }
                if (node.field === 'bin_id') {
                    const bin = props.bins.find(b => b.id === node.fieldValue);
                    if (bin) {
                        let owner = null;
                        if (bin.owner_type === 'actor') owner = props.actors.find(a => a.id === bin.owner_id);
                        else if (bin.owner_type === 'scene') owner = props.scenes.find(s => s.id === bin.owner_id);
                        return { bin, owner, typeOverride: 'bin' };
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
                        mediaType={props.selectedNode?.id}
                        voices={dataOps.voices}
                        loadingVoices={dataOps.loadingVoices}
                        error={commonError()}
                    />
                </Match>

                {/* Main Entity Redirects */}
                <Match when={activeType() === 'actor' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'actor')}>
                    <ActorView
                        actor={resolvedData()?.actor}
                        bins={props.bins}
                        operations={dataOps}
                        actorOps={actorOps}
                        sceneOps={sceneOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                        projectDefaults={globalDefaults.defaults()}
                    />
                </Match>

                <Match when={activeType() === 'scene' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'scene')}>
                    <SceneView
                        scene={resolvedData()?.scene}
                        bins={props.bins}
                        operations={dataOps}
                        actorOps={actorOps}
                        sceneOps={sceneOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                        projectDefaults={globalDefaults.defaults()}
                    />
                </Match>

                <Match when={activeType() === 'bin' || (activeType() === 'view-group' && resolvedData()?.typeOverride === 'bin')}>
                    <BinView
                        binData={resolvedData()?.bin}
                        owner={resolvedData()?.owner}
                        mediaType={resolvedData()?.bin?.media_type}
                        operations={dataOps}
                        viewConfig={activeViewConfig()}
                        groupNode={props.selectedNode}
                        projectDefaults={globalDefaults.defaults()}
                    />
                </Match>

                <Match when={activeType() === 'media'}>
                    <MediaView
                        item={resolvedData()?.item}
                        owner={resolvedData()?.owner}
                        bin={resolvedData()?.bin}
                        bins={props.bins}
                        allTakes={props.takes}
                        onMediaUpdated={props.onRefresh}
                        onBinUpdated={props.onRefresh}
                        onActorUpdated={props.onRefresh}
                        onMediaDeleted={props.onRefresh}
                        onTakesGenerated={props.onRefresh}
                        onTakeUpdated={props.onRefresh}
                        blankSpaceConversion={props.blankSpaceConversion}
                        capitalizationConversion={props.capitalizationConversion}
                        operations={dataOps}
                        projectDefaults={globalDefaults.defaults()}
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
                            // Clear selection after deletion to prevent crash
                            props.onSelect(null);
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
                            bins: props.bins,
                            scenes: props.scenes || [],
                            media: props.media,
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
