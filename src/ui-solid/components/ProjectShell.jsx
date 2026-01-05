import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { Box, Typography } from '@suid/material';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getMedia, getBins, getTakes, getScenes } from '../api/client.js';
import { useAppLog } from '../hooks/useAppLog.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useConsoleCapture } from '../hooks/useConsoleCapture.js';
import { AppProvider } from '../contexts/AppContext.jsx';
import { storage } from '../utils/storage.js';
import { PRESET_VIEWS } from '../utils/viewEngine.js';

export default function ProjectShell(props) {
    const [actors, setActors] = createSignal([]);
    const [mediaItems, setMediaItems] = createSignal([]);
    const [bins, setBins] = createSignal([]);
    const [takes, setTakes] = createSignal([]);
    const [scenes, setScenes] = createSignal([]);
    const [customViews, setCustomViews] = createSignal((() => {
        const key = 'custom-views';
        let saved = storage.get(props.currentProject.name, key);

        if (!saved || (Array.isArray(saved) && saved.length === 0)) {
            saved = Object.values(PRESET_VIEWS);
            storage.set(props.currentProject.name, key, saved);
        }

        const seen = new Set();
        return saved.filter(view => {
            if (seen.has(view.id)) return false;
            seen.add(view.id);
            return true;
        });
    })());

    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [selectedNode, setSelectedNode] = createSignal(null);
    const [expandNode, setExpandNode] = createSignal(null);

    const [treePaneWidth, setTreePaneWidth] = createSignal(storage.get(props.currentProject.name, 'tree-pane-width', 300));
    const [isResizing, setIsResizing] = createSignal(false);
    let containerRef;

    const appLog = useAppLog();
    const { logInfo, logSuccess, logError, logWarning } = appLog;

    const consoleCapture = useConsoleCapture();

    const handleStateRestored = (restoredState) => {
        setActors(restoredState.actors);
        setBins(restoredState.bins);
        setMediaItems(restoredState.media);
        logInfo(restoredState.message);
    };

    const undoStack = useUndoStack({
        onStateRestored: handleStateRestored,
    });

    const handlePlayTakeGlobal = (mediaId, take) => {
        if (props.onTakePlayed) {
            props.onTakePlayed(take.id);
        }
        if (props.onPlayTake) {
            props.onPlayTake(take);
        }
    };

    createEffect(() => {
        storage.set(props.currentProject.name, 'tree-pane-width', treePaneWidth());
    });

    createEffect(() => {
        storage.set(props.currentProject.name, 'custom-views', customViews());
    });

    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
        if (!isResizing() || !containerRef) return;
        const containerRect = containerRef.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        setTreePaneWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
        if (isResizing()) {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    };

    onMount(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    });

    onCleanup(() => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    });

    const reloadData = async () => {
        try {
            setLoading(true);
            console.log('[Project] Reloading project data for:', props.currentProject?.name);
            const [actorsRes, mediaRes, binsRes, takesRes, scenesRes] = await Promise.all([
                getActors(),
                getMedia(),
                getBins(),
                getTakes(),
                getScenes()
            ]);
            setActors(actorsRes.actors || []);
            setMediaItems(mediaRes.media || []);
            setBins(binsRes.bins || []);
            setTakes(takesRes.takes || []);
            setScenes(scenesRes.scenes || []);
            setError(null);

            const actorCount = actorsRes.actors?.length || 0;
            const binCount = binsRes.bins?.length || 0;
            const mediaCount = mediaRes.media?.length || 0;
            const takeCount = takesRes.takes?.length || 0;
            const sceneCount = scenesRes.scenes?.length || 0;
            console.log(`[Project] Loaded: ${actorCount} actors, ${binCount} bins, ${mediaCount} media items, ${takeCount} takes, ${sceneCount} scenes`);

            undoStack.refreshUndoState();
            appLog.reloadLogs();
        } catch (err) {
            console.error('[Project] Failed to load:', err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    if (props.ref) {
        props.ref.reloadData = reloadData;
    }

    onMount(() => {
        reloadData();
    });

    return (
        <>
            {loading() ? (
                <Box component="main" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body1">Loading project data…</Typography>
                </Box>
            ) : error() ? (
                <Box component="main" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography color="error">Error loading data: {error()}</Typography>
                </Box>
            ) : (
                <AppProvider
                    logInfo={logInfo}
                    logSuccess={logSuccess}
                    logError={logError}
                    logWarning={logWarning}
                    playingTakeId={props.currentPlayingTakeId}
                    onPlayRequest={handlePlayTakeGlobal}
                    onStopRequest={props.onStopPlayback}
                    playedTakes={props.playedTakes}
                    onTakePlayed={props.onTakePlayed}
                    onStatusChange={props.onStatusChange}
                    onCreditsRefresh={props.onCreditsRefresh}
                >
                    <Box ref={containerRef} component="main" sx={{ flexGrow: 1, display: 'flex', minWidth: 0, overflow: 'hidden', userSelect: isResizing() ? 'none' : 'auto' }}>
                        <TreePane
                            width={treePaneWidth()}
                            actors={actors()}
                            media={mediaItems()}
                            bins={bins()}
                            takes={takes()}
                            scenes={scenes()}
                            projectName={props.currentProject.name}
                            customViews={customViews()}
                            onCustomViewsChange={setCustomViews}
                            selectedNode={selectedNode()}
                            onSelect={setSelectedNode}
                            onExpandNode={setExpandNode}
                            playingTakeId={props.currentPlayingTakeId}
                            playedTakes={props.playedTakes}
                        />
                        <Box
                            onMouseDown={handleMouseDown}
                            sx={{
                                width: '1px',
                                cursor: 'col-resize',
                                backgroundColor: 'divider',
                                flexShrink: 0,
                                zIndex: 1,
                            }}
                        />
                        <DetailPane
                            actors={actors()}
                            media={mediaItems()}
                            bins={bins()}
                            takes={takes()}
                            scenes={scenes()}
                            selectedNode={selectedNode()}
                            expandNode={expandNode()}
                            logs={appLog.logs()}
                            onClearLogs={appLog.clearLogs}
                            undoRedo={undoStack}
                            consoleEntries={consoleCapture.entries()}
                            onClearConsole={consoleCapture.clearEntries}
                            blankSpaceConversion={props.blankSpaceConversion}
                            capitalizationConversion={props.capitalizationConversion}
                            onExpandNode={setExpandNode}
                            onRefresh={reloadData}
                            customViews={customViews()}
                            onCustomViewsChange={setCustomViews}
                        />
                    </Box>
                </AppProvider>
            )}
        </>
    );
}
