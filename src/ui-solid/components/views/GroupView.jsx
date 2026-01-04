
import { createMemo, createSignal, Show, Switch, Match, For } from 'solid-js';
import { Box, Typography, Button, Paper, Stack, Divider } from '@suid/material';
import ActorView from './ActorView.jsx';
import SectionView from '../../SectionView.jsx'; // Adjust path as needed
import DetailHeader from '../../DetailHeader.jsx';
import CompleteButton from '../../CompleteButton.jsx';
import { DESIGN_SYSTEM } from '../../theme/designSystem.js';

// Helper for listing group items
function GroupItemList(props) {
    return (
        <Stack spacing={1} sx={{ mt: 2 }}>
            <For each={props.items.slice(0, 50)}>
                {(item) => (
                    <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {item.filename || item.cue_id || 'Unknown Item'}
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

function SceneGroupView(props) {
    // props: groupNode (fieldValue=scene_id), data (scenes list), items
    const scene = () => props.data?.scenes?.find(s => s.id === props.groupNode.fieldValue);

    return (
        <Box>
            <DetailHeader
                title={scene()?.name || `Scene ${props.groupNode.label}`}
                subtitle={`Scene ID: ${props.groupNode.fieldValue}`}
            />
            <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    Settings for specific actors in this scene will be available here.
                </Typography>
                <Typography variant="overline" sx={{ mt: 2, display: 'block', color: 'text.secondary' }}>Scene Items</Typography>
                <GroupItemList items={props.items} />
            </Box>
        </Box>
    );
}

export default function GroupView(props) {
    // props: groupNode (selectedNode with field, fieldValue), data (actors, sections, scenes), operations, items (flattened children?)

    const flattenItems = (node) => {
        if (!node) return [];
        if (node.type === 'leaf') return [node.data]; // node.data is the asset index record
        if (node.children) return node.children.flatMap(flattenItems);
        return [];
    };

    const groupItems = createMemo(() => flattenItems(props.groupNode));

    return (
        <Switch>
            <Match when={props.groupNode.field === 'actor_id'}>
                {/* Reuse ActorView by finding the actor object */}
                {(() => {
                    const actor = props.data.actors.find(a => String(a.id) === String(props.groupNode.fieldValue));
                    if (!actor) return <Box sx={{ p: 3 }}>Actor not found: {props.groupNode.fieldValue}</Box>;

                    const actorSections = props.data.sections.filter(s => s.actor_id === actor.id);

                    return (
                        <ActorView
                            actor={actor}
                            sections={actorSections}
                            operations={props.operations}
                        />
                    );
                })()}
            </Match>

            <Match when={props.groupNode.field === 'section_id'}>
                {/* Reuse SectionView */}
                {(() => {
                    const section = props.data.sections.find(s => String(s.id) === String(props.groupNode.fieldValue));
                    if (!section) return <Box sx={{ p: 3 }}>Section not found: {props.groupNode.fieldValue}</Box>;

                    const actor = props.data.actors.find(a => a.id === section.actor_id);
                    const contentType = section.content_type || 'unknown';

                    return (
                        <SectionView
                            sectionData={section}
                            actor={actor}
                            contentType={contentType}
                            operations={props.operations}
                        />
                    );
                })()}
            </Match>

            <Match when={props.groupNode.field === 'scene_id'}>
                <SceneGroupView
                    groupNode={props.groupNode}
                    data={props.data}
                    items={groupItems()}
                />
            </Match>

            <Match when={props.groupNode.field === 'content_type'}>
                <TypeGroupView
                    groupNode={props.groupNode}
                    items={groupItems()}
                />
            </Match>

            {/* Fallback for status or other groups */}
            <Match when={true}>
                <TypeGroupView
                    groupNode={props.groupNode}
                    items={groupItems()}
                />
            </Match>
        </Switch>
    );
}
