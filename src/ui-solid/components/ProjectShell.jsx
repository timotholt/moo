import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { Box, Typography } from '@suid/material';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections, getTakes, getScenes } from '../api/client.js';
import { useAppLog } from '../hooks/useAppLog.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useConsoleCapture } from '../hooks/useConsoleCapture.js';
import { AppProvider } from '../contexts/AppContext.jsx';

export default function ProjectShell(props) {
    const [actors, setActors] = createSignal([]);
    const [content, setContent] = createSignal([]);
    const [sections, setSections] = createSignal([]);
    const [takes, setTakes] = createSignal([]);
    const [scenes, setScenes] = createSignal([]);
    const [customViews, setCustomViews] = createSignal((() => {
        try {
            const saved = localStorage.getItem('moo-custom-views');
            if (!saved) return [];

            const parsed = JSON.parse(saved);

            // Deduplicate by ID (keep first occurrence)
            const seen = new Set();
            const deduplicated = parsed.filter(view => {
                if (seen.has(view.id)) return false;
                seen.add(view.id);
                return true;
            });

            // Save back deduplicated version
            localStorage.setItem('moo-custom-views', JSON.stringify(deduplicated));

            return deduplicated;
        } catch (e) {
            console.error('Failed to load custom views:', e);
            return [];
        }
    })());

    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [selectedNode, setSelectedNode] = createSignal(null);
    const [expandNode, setExpandNode] = createSignal(null);

    // Resizable tree pane
    const [treePaneWidth, setTreePaneWidth] = createSignal((() => {
        try {
            const saved = localStorage.getItem('moo-tree-pane-width');
            return saved ? parseInt(saved, 10) : 300;
        } catch (e) {
            return 300;
        }
    })());
    const [isResizing, setIsResizing] = createSignal(false);
    let containerRef;

    // Application logging
    const appLog = useAppLog();
    const { logInfo, logSuccess, logError, logWarning } = appLog;

    // Console capture
    const consoleCapture = useConsoleCapture();

    // Handle state restored from undo
    const handleStateRestored = (restoredState) => {
        setActors(restoredState.actors);
        setSections(restoredState.sections);
        setContent(restoredState.content);
        logInfo(restoredState.message);
    };

    // Undo stack
    const undoStack = useUndoStack({
        onStateRestored: handleStateRestored,
    });

    const handlePlayTakeGlobal = (contentId, take) => {
        if (props.onTakePlayed) {
            props.onTakePlayed(take.id);
        }
        if (props.onPlayTake) {
            props.onPlayTake(take);
        }
    };

    // Save tree width to localStorage

    createEffect(() => {
        try {
            localStorage.setItem('moo-tree-pane-width', String(treePaneWidth()));
        } catch (e) {
            console.warn('Failed to save tree pane width:', e);
        }
    });

    createEffect(() => {
        try {
            localStorage.setItem('moo-custom-views', JSON.stringify(customViews()));
        } catch (e) {
            console.warn('Failed to save custom views:', e);
        }
    });

    // Handle resize drag
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

    // Reusable data loading function
    const reloadData = async () => {
        try {
            setLoading(true);
            console.log('[Project] Reloading project data for:', props.currentProject?.name);
            const [actorsRes, contentRes, sectionsRes, takesRes, scenesRes] = await Promise.all([
                getActors(),
                getContent(),
                getSections(),
                getTakes(),
                getScenes()
            ]);
            setActors(actorsRes.actors || []);
            setContent(contentRes.content || []);
            setSections(sectionsRes.sections || []);
            setTakes(takesRes.takes || []);
            setScenes(scenesRes.scenes || []);
            setError(null);

            // Log summary
            const actorCount = actorsRes.actors?.length || 0;
            const sectionCount = sectionsRes.sections?.length || 0;
            const cueCount = contentRes.content?.length || 0;
            const takeCount = takesRes.takes?.length || 0;
            const sceneCount = scenesRes.scenes?.length || 0;
            console.log(`[Project] Loaded: ${actorCount} actors, ${sectionCount} sections, ${cueCount} cues, ${takeCount} takes, ${sceneCount} scenes`);

            // Refresh undo state and logs
            undoStack.refreshUndoState();
            appLog.reloadLogs();
        } catch (err) {
            console.error('[Project] Failed to load:', err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    // Expose reloadData to parent via props.ref
    if (props.ref) {
        props.ref.reloadData = reloadData;
    }

    // Initial load
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
                            content={content()}
                            sections={sections()}
                            takes={takes()}
                            scenes={scenes()}
                            customViews={customViews()}
                            onCustomViewsChange={setCustomViews}
                            selectedNode={selectedNode()}
                            onSelect={setSelectedNode}
                            onExpandNode={setExpandNode}
                            playingTakeId={props.currentPlayingTakeId}
                            playedTakes={props.playedTakes}
                        />
                        {/* Resizable divider */}
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
                            content={content()}
                            sections={sections()}
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
