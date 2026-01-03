import { createMemo, Show, Switch, Match } from 'solid-js';
import { Box, Typography } from '@suid/material';
import NoSelectionView from './NoSelectionView.jsx';
import SectionView from './SectionView.jsx';
import ContentView from './ContentView.jsx';
import ProviderDefaultsView from './ProviderDefaultsView.jsx';
import ActorView from './views/ActorView.jsx';
import RootView from './views/RootView.jsx';
import DefaultsView from './views/DefaultsView.jsx';
import HistoryView from './HistoryView.jsx';
import BrowserConsoleView from './BrowserConsoleView.jsx';
import { useActorOperations } from '../hooks/useActorOperations.jsx';
import { useDataOperations } from '../hooks/useDataOperations.jsx';

export default function DetailPane(props) {
    // props: actors, content, sections, takes, selectedNode, expandNode, 
    //        onExpandNode, onRefresh, logs, consoleEntries, blankSpaceConversion, capitalizationConversion

    const actorOps = useActorOperations({
        onActorCreated: props.onRefresh,
        onActorUpdated: props.onRefresh,
        onActorDeleted: props.onRefresh,
        expandNode: props.onExpandNode
    });

    const dataOps = useDataOperations({
        actors: props.actors,
        sections: props.sections,
        selectedNode: props.selectedNode,
        expandNode: props.onExpandNode,
        onContentCreated: props.onRefresh,
        onSectionCreated: props.onRefresh,
        onActorUpdated: props.onRefresh,
        onSectionUpdated: props.onRefresh,
        onSectionDeleted: props.onRefresh,
        deleteActor: actorOps.deleteActor
    });

    const viewData = createMemo(() => {
        if (!props.selectedNode) return { view: 'welcome' };

        const { type, id } = props.selectedNode;

        switch (type) {
            case 'root':
                return { view: 'root' };
            case 'defaults':
                return { view: 'defaults' };
            case 'provider-default':
                return { view: 'provider-default', contentType: id };
            case 'console':
                return { view: 'console' };
            case 'history':
                return { view: 'history' };
            case 'actor': {
                const actor = props.actors.find(a => a.id === id);
                return { view: 'actor', actor };
            }
            case 'dialogue-section':
            case 'music-section':
            case 'sfx-section': {
                const section = props.sections.find(s => s.id === id);
                const actor = props.actors.find(a => a.id === section?.actor_id);
                const contentType = type.split('-')[0];
                return { view: 'section', section, actor, contentType };
            }
            case 'content': {
                const item = props.content.find(c => c.id === id);
                const actor = props.actors.find(a => a.id === item?.actor_id);
                return { view: 'content', item, actor };
            }
            default:
                return { view: 'welcome' };
        }
    });

    const commonError = () => dataOps.error() || actorOps.error();

    return (
        <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Switch fallback={
                <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography color="text.secondary">Select an item to view details.</Typography>
                </Box>
            }>
                <Match when={viewData().view === 'welcome'}>
                    <NoSelectionView error={commonError()} />
                </Match>

                <Match when={viewData().view === 'root'}>
                    <RootView actorOps={actorOps} error={commonError()} />
                </Match>

                <Match when={viewData().view === 'defaults'}>
                    <DefaultsView />
                </Match>

                <Match when={viewData().view === 'console'}>
                    <BrowserConsoleView
                        entries={props.consoleEntries}
                        onClear={() => {/* logic handled via context or prop if needed but simple log clear is fine */ }}
                    />
                </Match>

                <Match when={viewData().view === 'history'}>
                    <HistoryView
                        logs={props.logs}
                        onClearLogs={async () => {/* implement clear if desired */ }}
                    />
                </Match>

                <Match when={viewData().view === 'provider-default'}>
                    <ProviderDefaultsView
                        contentType={viewData().contentType}
                        voices={dataOps.voices}
                        loadingVoices={dataOps.loadingVoices}
                        error={commonError()}
                    />
                </Match>

                <Match when={viewData().view === 'actor'}>
                    <ActorView
                        actor={viewData().actor}
                        sections={props.sections}
                        operations={dataOps}
                    />
                </Match>

                <Match when={viewData().view === 'section'}>
                    <SectionView
                        sectionData={viewData().section}
                        actor={viewData().actor}
                        contentType={viewData().contentType}
                        operations={dataOps}
                    />
                </Match>

                <Match when={viewData().view === 'content'}>
                    <ContentView
                        item={viewData().item}
                        actor={viewData().actor}
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
                        error={commonError()}
                    />
                </Match>
            </Switch>
        </Box>
    );
}
