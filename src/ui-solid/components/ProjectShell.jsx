import { createSignal, createEffect, onMount, Show } from 'solid-js';
import { Box, Typography } from '@suid/material';
import TreePane from './TreePane.jsx';
import DetailPane from './DetailPane.jsx';
import { getActors, getContent, getSections, getTakes } from '../api/client.js';
import { useAppLog } from '../hooks/useAppLog.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useConsoleCapture } from '../hooks/useConsoleCapture.js';
import { AppProvider } from '../contexts/AppContext.jsx';

export default function ProjectShell(props) {
    const [actors, setActors] = createSignal([]);
    const [content, setContent] = createSignal([]);
    const [sections, setSections] = createSignal([]);
    const [takes, setTakes] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [selectedNode, setSelectedNode] = createSignal(null);
    const [expandNode, setExpandNode] = createSignal(null);
    const [playedTakes, setPlayedTakes] = createSignal(() => {
        try {
            const saved = localStorage.getItem('audiomanager-played-takes');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('Failed to load played takes from localStorage:', e);
            return {};
        }
    });

    // Resizable tree pane
    const [treePaneWidth, setTreePaneWidth] = createSignal(() => {
        try {
            const saved = localStorage.getItem('audiomanager-tree-pane-width');
            return saved ? parseInt(saved, 10) : 300;
        } catch (e) {
            return 300;
        }
    });
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
        setPlayedTakes((prev) => ({ ...prev, [take.id]: true }));
        if (props.onPlayTake) {
            props.onPlayTake(take);
        }
    };

    // Save played takes and tree width to localStorage
    createEffect(() => {
        try {
            localStorage.setItem('audiomanager-played-takes', JSON.stringify(playedTakes()));
        } catch (e) {
            console.warn('Failed to save played takes to localStorage:', e);
        }
    });

    createEffect(() => {
        try {
            localStorage.setItem('audiomanager-tree-pane-width', String(treePaneWidth()));
        } catch (e) {
            console.warn('Failed to save tree pane width:', e);
        }
    });

    // Handle resize drag
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    createEffect(() => {
        if (!isResizing()) return;

        const handleMouseMove = (e) => {
            if (!containerRef) return;
            const containerRect = containerRef.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
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
    });

    // Reusable data loading function
    const reloadData = async () => {
        try {
            console.log('[Project] Reloading project data...');
            const [actorsRes, contentRes, sectionsRes, takesRes] = await Promise.all([
                getActors(),
                getContent(),
                getSections(),
                getTakes()
            ]);
            setActors(actorsRes.actors || []);
            setContent(contentRes.content || []);
            setSections(sectionsRes.sections || []);
            setTakes(takesRes.takes || []);
            setError(null);

            // Log summary
            const actorCount = actorsRes.actors?.length || 0;
            const sectionCount = sectionsRes.sections?.length || 0;
            const cueCount = contentRes.content?.length || 0;
            const takeCount = takesRes.takes?.length || 0;
            console.log(`[Project] Loaded: ${actorCount} actors, ${sectionCount} sections, ${cueCount} cues, ${takeCount} takes`);

            // Refresh undo state and logs
            undoStack.refreshUndoState();
            appLog.reloadLogs();
        } catch (err) {
            console.error('[Project] Failed to load:', err);
            setError(err.message || String(err));
        }
    };

    // Expose reloadData to parent via props.ref
    if (props.ref) {
        props.ref.reloadData = reloadData;
    }

    // Initial load
    onMount(async () => {
        try {
            setLoading(true);
            await reloadData();
        } finally {
            setLoading(false);
        }
    });

    return (
        <Show
            when={!loading()}
            fallback={
                <Box component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body1">Loading project data…</Typography>
                </Box>
            }
        >
            <Show
                when={!error()}
                fallback={
                    <Box component="main" sx={{ flexGrow: 1, pt: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography color="error">Error loading data: {error()}</Typography>
                    </Box>
                }
            >
                <AppProvider
                    logInfo={logInfo}
                    logSuccess={logSuccess}
                    logError={logError}
                    logWarning={logWarning}
                    playingTakeId={props.currentPlayingTakeId}
                    onPlayRequest={handlePlayTakeGlobal}
                    onStopRequest={props.onStopPlayback}
                    playedTakes={playedTakes()}
                    onTakePlayed={(takeId) => setPlayedTakes((prev) => ({ ...prev, [takeId]: true }))}
                    onStatusChange={props.onStatusChange}
                    onCreditsRefresh={props.onCreditsRefresh}
                >
                    <Box ref={containerRef} component="main" sx={{ flexGrow: 1, pt: 6, pb: '6rem', display: 'flex', minWidth: 0, userSelect: isResizing() ? 'none' : 'auto' }}>
                        <TreePane
                            width={treePaneWidth()}
                            actors={actors()}
                            content={content()}
                            sections={sections()}
                            takes={takes()}
                            selectedNode={selectedNode()}
                            onSelect={setSelectedNode}
                            onExpandNode={setExpandNode}
                            playingTakeId={props.currentPlayingTakeId}
                            playedTakes={playedTakes()}
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
                            selectedNode={selectedNode()}
                            expandNode={expandNode()}
                            logs={appLog.logs()}
                            consoleEntries={consoleCapture.entries()}
                            blankSpaceConversion={props.blankSpaceConversion}
                            capitalizationConversion={props.capitalizationConversion}
                            onExpandNode={setExpandNode}
                            onRefresh={reloadData}
                        />
                    </Box>
                </AppProvider>
            </Show>
        </Show>
    );
}
