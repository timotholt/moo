import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    InputLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography
} from '@suid/material';
import AddIcon from '@suid/icons-material/Add';
import DeleteOutlineIcon from '@suid/icons-material/DeleteOutline';
import TextInput from '../TextInput.jsx';
import { deleteCard, renderCard, updateCard } from '../../api/client.js';
import { mediaUrlForPath } from '../TakePreview.jsx';
import { CardSchema } from '../../../shared/schemas/index.js';

const ASSET_KINDS = ['dialogue', 'music', 'sfx', 'image', 'video'];
const AUDIO_FORMATS = ['wav', 'mp3', 'ogg', 'm4a', 'flac'];
const IMAGE_FORMATS = ['png', 'webp', 'jpeg'];
const VIDEO_FORMATS = ['mp4', 'webm', 'mov'];

function editableMetadata(record = {}) {
    return Object.entries(record).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value)
    }));
}

function metadataRecord(entries, label) {
    const record = {};
    for (const entry of entries) {
        const key = entry.key.trim();
        if (!key) throw new Error(`${label} keys cannot be empty.`);
        if (Object.hasOwn(record, key)) throw new Error(`${label} key "${key}" is duplicated.`);
        const value = entry.value.trim();
        if (!value) {
            record[key] = '';
            continue;
        }
        try {
            record[key] = JSON.parse(value);
        } catch {
            record[key] = value;
        }
    }
    return record;
}

function defaultDelivery(kind) {
    if (kind === 'image') return { format: 'png', width: 1024, height: 1024, transparency: false };
    if (kind === 'video') return { format: 'mp4', width: 1920, height: 1080, video_aspect_ratio: '16:9' };
    return { format: 'wav' };
}

function cloneSlots(slots = []) {
    return slots.map(slot => ({ ...slot, delivery: { ...slot.delivery } }));
}

function formatsFor(kind) {
    if (kind === 'image') return IMAGE_FORMATS;
    if (kind === 'video') return VIDEO_FORMATS;
    return AUDIO_FORMATS;
}

function MetadataEditor(props) {
    const updateEntry = (index, field, value) => {
        props.setEntries(entries => entries.map((entry, entryIndex) => (
            entryIndex === index ? { ...entry, [field]: value } : entry
        )));
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Box>
                    <Typography variant="subtitle2">{props.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{props.description}</Typography>
                </Box>
                <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => props.setEntries(entries => [...entries, { key: '', value: '' }])}
                >
                    Add field
                </Button>
            </Stack>
            <Stack spacing={1}>
                <For each={props.entries()}>
                    {(entry, index) => (
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                            <TextInput
                                label="Key"
                                size="small"
                                value={entry.key}
                                onValueChange={(value) => updateEntry(index(), 'key', value)}
                                sx={{ minWidth: '12rem' }}
                            />
                            <TextInput
                                label="Value"
                                size="small"
                                fullWidth
                                value={entry.value}
                                onValueChange={(value) => updateEntry(index(), 'value', value)}
                                helperText="Text, number, boolean, or compact JSON"
                            />
                            <Button
                                color="error"
                                size="small"
                                onClick={() => props.setEntries(entries => entries.filter((_, entryIndex) => entryIndex !== index()))}
                            >
                                Remove
                            </Button>
                        </Stack>
                    )}
                </For>
                <Show when={props.entries().length === 0}>
                    <Typography variant="body2" color="text.secondary">No fields configured.</Typography>
                </Show>
            </Stack>
        </Paper>
    );
}

export default function CardView(props) {
    const [name, setName] = createSignal('');
    const [key, setKey] = createSignal('');
    const [rules, setRules] = createSignal([]);
    const [gameplayMetadata, setGameplayMetadata] = createSignal([]);
    const [slots, setSlots] = createSignal([]);
    const [saving, setSaving] = createSignal(false);
    const [rendering, setRendering] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
    const [renderResult, setRenderResult] = createSignal(null);
    const [error, setError] = createSignal(null);
    const [success, setSuccess] = createSignal(null);

    createEffect(() => {
        const card = props.card;
        if (!card) return;
        setName(card.name);
        setKey(card.key);
        setRules(editableMetadata(card.rules));
        setGameplayMetadata(editableMetadata(card.gameplay_metadata));
        setSlots(cloneSlots(card.asset_slots));
        setRenderResult(null);
        setError(null);
    });

    const requiredSlots = createMemo(() => slots().filter(slot => slot.required));
    const completedRequiredSlots = createMemo(() => requiredSlots().filter(slot => slot.media_id));
    const completionPercent = createMemo(() => (
        requiredSlots().length === 0 ? 100 : Math.round((completedRequiredSlots().length / requiredSlots().length) * 100)
    ));

    const updateSlot = (index, updater) => {
        setSlots(current => current.map((slot, slotIndex) => (
            slotIndex === index ? updater(slot) : slot
        )));
    };

    const setSlotField = (index, field, value) => {
        updateSlot(index, slot => ({ ...slot, [field]: value }));
    };

    const setDeliveryField = (index, field, value) => {
        updateSlot(index, slot => ({
            ...slot,
            delivery: {
                ...slot.delivery,
                [field]: value
            }
        }));
    };

    const changeSlotKind = (index, kind) => {
        updateSlot(index, slot => ({
            ...slot,
            asset_kind: kind,
            media_id: undefined,
            delivery: defaultDelivery(kind)
        }));
    };

    const changeVideoRatio = (index, ratio) => {
        updateSlot(index, slot => ({
            ...slot,
            delivery: {
                ...slot.delivery,
                video_aspect_ratio: ratio,
                width: ratio === '9:16' ? 1080 : 1920,
                height: ratio === '9:16' ? 1920 : 1080
            }
        }));
    };

    const addSlot = () => {
        setSlots(current => [
            ...current,
            {
                key: `asset_${current.length + 1}`,
                label: `Asset ${current.length + 1}`,
                asset_kind: 'image',
                required: true,
                delivery: defaultDelivery('image')
            }
        ]);
    };

    const mediaForSlot = (slot) => (
        (props.media || []).filter(item => item.media_type === slot.asset_kind)
    );

    const handleSave = async () => {
        if (!props.card || saving()) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const draft = {
                ...props.card,
                name: name().trim(),
                key: key().trim(),
                rules: metadataRecord(rules(), 'Rules'),
                gameplay_metadata: metadataRecord(gameplayMetadata(), 'Gameplay metadata'),
                asset_slots: cloneSlots(slots())
            };
            const parsed = CardSchema.safeParse(draft);
            if (!parsed.success) {
                throw new Error(parsed.error.issues.map(issue => {
                    const path = issue.path.map(String).join('.');
                    return path ? `${path}: ${issue.message}` : issue.message;
                }).join(' · '));
            }
            await updateCard(props.card.id, {
                name: parsed.data.name,
                key: parsed.data.key,
                rules: parsed.data.rules,
                gameplay_metadata: parsed.data.gameplay_metadata,
                asset_slots: parsed.data.asset_slots
            });
            await props.onRefresh?.();
            setSuccess('Card saved.');
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!props.card || deleting()) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteCard(props.card.id);
            setDeleteDialogOpen(false);
            props.onSelect?.(null);
            await props.onRefresh?.();
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setDeleting(false);
        }
    };

    const handleRender = async () => {
        if (!props.card || rendering()) return;
        setRendering(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await renderCard(props.card.id);
            setRenderResult(result);
            setSuccess('Card rendered from its selected approved takes.');
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setRendering(false);
        }
    };

    return (
        <Show when={props.card} fallback={
            <Box sx={{ p: 3 }}><Typography color="text.secondary">Card not found.</Typography></Box>
        }>
            <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                    <Box>
                        <Typography variant="h5">{props.card.name}</Typography>
                        <Typography variant="caption" color="text.secondary">Card ID: {props.card.id}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button variant="outlined" disabled={rendering() || saving()} onClick={handleRender}>
                            {rendering() ? 'Rendering…' : 'Render card'}
                        </Button>
                        <Button color="error" variant="outlined" onClick={() => setDeleteDialogOpen(true)}>
                            Delete card
                        </Button>
                        <Button variant="contained" disabled={saving()} onClick={handleSave}>
                            {saving() ? 'Saving…' : 'Save card'}
                        </Button>
                    </Stack>
                </Stack>

                <Show when={error()}><Alert severity="error" sx={{ mt: 2 }}>{error()}</Alert></Show>
                <Show when={success()}><Alert severity="success" sx={{ mt: 2 }}>{success()}</Alert></Show>

                <Stack spacing={3} sx={{ mt: 3 }}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2 }}>Identity</Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextInput label="Card name" fullWidth value={name()} onValueChange={setName} />
                            <TextInput
                                label="Card key"
                                fullWidth
                                value={key()}
                                onValueChange={setKey}
                                helperText="Lowercase letters, numbers, dashes, or underscores"
                            />
                        </Stack>
                    </Paper>

                    <MetadataEditor
                        title="Rules"
                        description="Structured rules fields consumed by the card compositor or game export."
                        entries={rules}
                        setEntries={setRules}
                    />
                    <MetadataEditor
                        title="Gameplay metadata"
                        description="Structured values such as cost, rarity, faction, attack, or health."
                        entries={gameplayMetadata}
                        setEntries={setGameplayMetadata}
                    />

                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                            <Box>
                                <Typography variant="subtitle2">Asset slots</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {completedRequiredSlots().length} of {requiredSlots().length} required slots assigned
                                </Typography>
                            </Box>
                            <Button startIcon={<AddIcon />} onClick={addSlot}>Add asset slot</Button>
                        </Stack>
                        <LinearProgress variant="determinate" value={completionPercent()} sx={{ my: 2 }} />

                        <Stack spacing={2}>
                            <For each={slots()}>
                                {(slot, index) => (
                                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                            <Typography variant="subtitle2">
                                                {slot.label || slot.key || `Slot ${index() + 1}`}
                                            </Typography>
                                            <Button
                                                color="error"
                                                size="small"
                                                startIcon={<DeleteOutlineIcon />}
                                                onClick={() => setSlots(current => current.filter((_, slotIndex) => slotIndex !== index()))}
                                            >
                                                Remove
                                            </Button>
                                        </Stack>

                                        <Stack spacing={2}>
                                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                                                <TextInput
                                                    label="Slot key"
                                                    fullWidth
                                                    size="small"
                                                    value={slot.key}
                                                    onValueChange={(value) => setSlotField(index(), 'key', value)}
                                                />
                                                <TextInput
                                                    label="Label"
                                                    fullWidth
                                                    size="small"
                                                    value={slot.label}
                                                    onValueChange={(value) => setSlotField(index(), 'label', value)}
                                                />
                                                <FormControl size="small" fullWidth>
                                                    <InputLabel>Asset kind</InputLabel>
                                                    <Select
                                                        label="Asset kind"
                                                        value={slot.asset_kind}
                                                        onChange={(event) => changeSlotKind(index(), event.target.value)}
                                                    >
                                                        <For each={ASSET_KINDS}>
                                                            {(kind) => <MenuItem value={kind}>{kind}</MenuItem>}
                                                        </For>
                                                    </Select>
                                                </FormControl>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={slot.required}
                                                            onChange={(event) => setSlotField(index(), 'required', event.target.checked)}
                                                        />
                                                    }
                                                    label="Required"
                                                />
                                            </Stack>

                                            <FormControl size="small" fullWidth>
                                                <InputLabel>Media assignment</InputLabel>
                                                <Select
                                                    label="Media assignment"
                                                    value={slot.media_id || ''}
                                                    onChange={(event) => setSlotField(index(), 'media_id', event.target.value || undefined)}
                                                >
                                                    <MenuItem value=""><em>Unassigned</em></MenuItem>
                                                    <For each={mediaForSlot(slot)}>
                                                        {(item) => (
                                                            <MenuItem value={item.id}>
                                                                {item.name} · {item.owner_type}
                                                            </MenuItem>
                                                        )}
                                                    </For>
                                                </Select>
                                            </FormControl>

                                            <Divider />
                                            <Typography variant="overline" color="text.secondary">Delivery requirements</Typography>
                                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                                                <FormControl size="small" sx={{ minWidth: '9rem' }}>
                                                    <InputLabel>Format</InputLabel>
                                                    <Select
                                                        label="Format"
                                                        value={slot.delivery.format}
                                                        onChange={(event) => setDeliveryField(index(), 'format', event.target.value)}
                                                    >
                                                        <For each={formatsFor(slot.asset_kind)}>
                                                            {(format) => <MenuItem value={format}>{format}</MenuItem>}
                                                        </For>
                                                    </Select>
                                                </FormControl>

                                                <Show when={slot.asset_kind === 'image' || slot.asset_kind === 'video'}>
                                                    <TextInput
                                                        label="Width"
                                                        type="number"
                                                        size="small"
                                                        value={slot.delivery.width ?? ''}
                                                        onValueChange={(value) => setDeliveryField(index(), 'width', value === '' ? undefined : Number(value))}
                                                    />
                                                    <TextInput
                                                        label="Height"
                                                        type="number"
                                                        size="small"
                                                        value={slot.delivery.height ?? ''}
                                                        onValueChange={(value) => setDeliveryField(index(), 'height', value === '' ? undefined : Number(value))}
                                                    />
                                                </Show>

                                                <Show when={slot.asset_kind === 'image'}>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={slot.delivery.transparency === true}
                                                                onChange={(event) => setDeliveryField(index(), 'transparency', event.target.checked)}
                                                            />
                                                        }
                                                        label="Transparency"
                                                    />
                                                </Show>

                                                <Show when={slot.asset_kind === 'video'}>
                                                    <FormControl size="small" sx={{ minWidth: '9rem' }}>
                                                        <InputLabel>Video ratio</InputLabel>
                                                        <Select
                                                            label="Video ratio"
                                                            value={slot.delivery.video_aspect_ratio || '16:9'}
                                                            onChange={(event) => changeVideoRatio(index(), event.target.value)}
                                                        >
                                                            <MenuItem value="16:9">16:9 landscape</MenuItem>
                                                            <MenuItem value="9:16">9:16 portrait</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Show>
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                )}
                            </For>
                            <Show when={slots().length === 0}>
                                <Typography variant="body2" color="text.secondary">
                                    No asset slots yet. Add one to define the card’s image, audio, or video requirements.
                                </Typography>
                            </Show>
                        </Stack>
                    </Paper>

                    <Show when={renderResult()}>
                        {(rendered) => (
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2">Rendered card</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {rendered().width} × {rendered().height} · {rendered().hash_sha256}
                                </Typography>
                                <Box
                                    component="img"
                                    src={mediaUrlForPath(rendered().file)}
                                    alt={`Rendered ${props.card.name} card`}
                                    sx={{
                                        display: 'block',
                                        width: '100%',
                                        maxWidth: '420px',
                                        mt: 2,
                                        borderRadius: 1,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                    }}
                                />
                            </Paper>
                        )}
                    </Show>
                </Stack>

                <Dialog open={deleteDialogOpen()} onClose={() => !deleting() && setDeleteDialogOpen(false)}>
                    <DialogTitle>Delete card?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Delete <strong>{props.card.name}</strong> and its card-owned catalog records?
                            Generated binaries remain on disk and the catalog mutation is snapshotted.
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button disabled={deleting()} onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                        <Button color="error" disabled={deleting()} onClick={handleDelete}>
                            {deleting() ? 'Deleting…' : 'Delete'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Show>
    );
}
