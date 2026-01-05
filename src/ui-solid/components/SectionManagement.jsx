import { Box, Typography, Button, Stack } from '@suid/material';
import TextInput from './TextInput.jsx';
import { createSignal, For, Show, createMemo } from 'solid-js';

export default function SectionManagement(props) {
    // props: owner, ownerType, sections, onCreateSection, creatingContent
    const [namesValue, setNamesValue] = createSignal('');

    const parsedNames = createMemo(() => {
        return namesValue().split(',').map(s => s.trim()).filter(s => s.length > 0);
    });

    const handleCreate = async (type) => {
        const names = parsedNames();
        if (names.length === 0) {
            // Default behavior if empty: create one section with default name
            await props.onCreateSection(props.owner.id, props.ownerType, type);
        } else {
            for (const name of names) {
                await props.onCreateSection(props.owner.id, props.ownerType, type, { name });
            }
        }
        setNamesValue('');
    };

    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                Content Sections
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter names (comma separated) for multiple sections, then select the type to create them.
            </Typography>

            <Box sx={{ mt: 2, mb: 2 }}>
                <TextInput
                    fullWidth
                    size="small"
                    placeholder="Section names, e.g. Battle_Dialogue, Story_Intro"
                    value={namesValue()}
                    onValueChange={setNamesValue}
                />
            </Box>

            <Stack spacing={1} sx={{ mt: 1 }}>
                {/* Show existing sections categorized by type */}
                <For each={['dialogue', 'music', 'sfx', 'image', 'video']}>
                    {(contentType) => {
                        const sectionsOfType = () => props.sections.filter(
                            (s) => s.owner_id === props.owner.id && s.owner_type === props.ownerType && s.content_type === contentType
                        );

                        return (
                            <Show when={sectionsOfType().length > 0}>
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: 500,
                                            mb: 0.5,
                                        }}
                                    >
                                        {contentType} sections:
                                    </Typography>
                                    <For each={sectionsOfType()}>
                                        {(section) => (
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    ml: 1,
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    sx={{ minWidth: 120 }}
                                                >
                                                    {section.name || section.content_type}
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    color="success.main"
                                                >
                                                    ✓ section exists
                                                </Typography>
                                            </Box>
                                        )}
                                    </For>
                                </Box>
                            </Show>
                        );
                    }}
                </For>

                {/* Add new section buttons */}
                <Box
                    sx={{
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                        mt: 1,
                    }}
                >
                    <For each={['dialogue', 'music', 'sfx', 'image', 'video']}>
                        {(type) => (
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleCreate(type)}
                                disabled={props.creatingContent}
                                sx={{ fontSize: '0.75rem' }}
                            >
                                Add {type} {parsedNames().length > 1 ? `Sections (${parsedNames().length})` : 'Section'}
                            </Button>
                        )}
                    </For>
                </Box>
            </Stack>
        </Box>
    );
}
