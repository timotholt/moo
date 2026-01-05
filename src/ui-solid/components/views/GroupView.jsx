import { createMemo, createSignal, Show, Switch, Match, For } from 'solid-js';
import { Box, Typography, Button, Paper, Stack, Divider } from '@suid/material';
import ActorView from './ActorView.jsx';
import SceneView from './SceneView.jsx';
import BinView from '../BinView.jsx';
import DetailHeader from '../DetailHeader.jsx';
import CompleteButton from '../CompleteButton.jsx';
import { DESIGN_SYSTEM } from '../../theme/designSystem.js';

// Helper for listing group items
function GroupItemList(props) {
    return (
        <Stack spacing={1} sx={{ mt: 2 }}>
            <For each={props.items.slice(0, 50)}>
                {(item) => (
                    <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {item.name || item.filename || 'Unknown Item'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: item.status === 'approved' ? 'success.main' : 'text.secondary' }}>
                            {item.status || 'new'}
                        </Typography>
                    </Paper>
                )}
            </For>
            <Show when={props.items.length > 50}>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block' }}>
                    ...and {props.items.length - 50} more items
                </Typography>
            </Show>
        </Stack>
    );
}

function TypeGroupView(props) {
    // props: groupNode (label, count, children, fieldValue=dialogue/etc), items (all flattened items in group)

    const approvedCount = () => props.items.filter(i => i.status === 'approved').length;
    const totalCount = () => props.items.length;
    const progress = () => totalCount() > 0 ? (approvedCount() / totalCount()) * 100 : 0;

    return (
        <Box sx={{ p: 3 }}>
            <DetailHeader
                title={`${props.groupNode.label} Group`}
                subtitle={`${approvedCount()} / ${totalCount()} items approved`}
                rightActions={
                    <CompleteButton
                        isComplete={approvedCount() === totalCount() && totalCount() > 0}
                        onToggle={() => { /* Bulk complete not implemented yet */ }}
                        disabled={true}
                        disabledReason="Bulk completion coming soon"
                        itemType="group"
                    />
                }
            />

            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Group Statistics</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography variant="body2">Progress: {Math.round(progress())}%</Typography>
                    <Box sx={{ flexGrow: 1, height: 8, bgcolor: 'action.hover', borderRadius: 4, overflow: 'hidden' }}>
                        <Box sx={{ width: `${progress()}%`, height: '100%', bgcolor: 'success.main', transition: 'width 0.3s' }} />
                    </Box>
                </Box>
            </Paper>

            <Typography variant="overline" sx={{ mt: 3, display: 'block', color: 'text.secondary' }}>Items in Group</Typography>
            <GroupItemList items={props.items} />
        </Box>
    );
}

export default function GroupView(props) {
    // props: groupNode (selectedNode with field, fieldValue), data (actors, bins, scenes, media, takes), operations

    const flattenItems = (node) => {
        if (!node) return [];
        if (node.type === 'leaf') return [node.data];
        if (node.children) return node.children.flatMap(flattenItems);
        return [];
    };

    const groupItems = createMemo(() => flattenItems(props.groupNode));

    return (
        <Switch>
            <Match when={props.groupNode.field === 'owner_id' || props.groupNode.field === 'actor_id'}>
                {(() => {
                    const id = props.groupNode.fieldValue;
                    const actor = props.data.actors.find(a => String(a.id) === String(id));
                    if (actor) {
                        const actorBins = props.data.bins.filter(b => b.owner_id === actor.id && b.owner_type === 'actor');
                        return (
                            <ActorView
                                actor={actor}
                                bins={actorBins}
                                operations={props.operations}
                            />
                        );
                    }
                    const scene = props.data.scenes.find(s => String(s.id) === String(id));
                    if (scene) {
                        const sceneBins = props.data.bins.filter(b => b.owner_id === scene.id && b.owner_type === 'scene');
                        return (
                            <SceneView
                                scene={scene}
                                bins={sceneBins}
                                operations={props.operations}
                            />
                        );
                    }
                    return <Box sx={{ p: 3 }}>Owner not found: {id}</Box>;
                })()}
            </Match>

            <Match when={props.groupNode.field === 'bin_id'}>
                {(() => {
                    const bin = props.data.bins.find(b => String(b.id) === String(props.groupNode.fieldValue));
                    if (!bin) return <Box sx={{ p: 3 }}>Bin not found: {props.groupNode.fieldValue}</Box>;

                    let owner = null;
                    if (bin.owner_type === 'actor') owner = props.data.actors.find(a => a.id === bin.owner_id);
                    else if (bin.owner_type === 'scene') owner = props.data.scenes.find(s => s.id === bin.owner_id);

                    return (
                        <BinView
                            binData={bin}
                            owner={owner}
                            mediaType={bin.media_type}
                            operations={props.operations}
                        />
                    );
                })()}
            </Match>

            <Match when={props.groupNode.field === 'media_type'}>
                <TypeGroupView
                    groupNode={props.groupNode}
                    items={groupItems()}
                />
            </Match>

            <Match when={true}>
                <TypeGroupView
                    groupNode={props.groupNode}
                    items={groupItems()}
                />
            </Match>
        </Switch>
    );
}
