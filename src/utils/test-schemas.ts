import { ActorSchema, SceneSchema, BinSchema, MediaSchema, TakeSchema, DefaultsSchema } from '../shared/schemas/index.js';
import { z } from 'zod';

console.log('--- Testing Schemas ---');

function logZodError(err: z.ZodError) {
    console.log(JSON.stringify(err.format(), null, 2));
}

try {
    // 1. Test Actor
    console.log('Testing Actor...');
    try {
        ActorSchema.parse({
            id: 'actor_123',
            display_name: 'John Doe',
            base_filename: 'john',
            default_blocks: {
                dialogue: {
                    provider: 'elevenlabs',
                    voice_id: 'voice_abc'
                }
            },
            actor_complete: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            logZodError(e);
            throw new Error('Actor failed');
        }
        throw e;
    }

    // 2. Test Scene
    console.log('Testing Scene...');
    SceneSchema.parse({
        id: 'scene_456',
        name: 'Intro Scene',
        description: 'First scene',
        default_blocks: {
            music: {
                provider: 'elevenlabs',
                duration_seconds: 45
            }
        },
        actor_ids: [],
        scene_complete: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // 3. Test Bin
    console.log('Testing Bin...');
    BinSchema.parse({
        id: 'bin_789',
        owner_type: 'actor',
        owner_id: 'actor_123',
        media_type: 'dialogue',
        name: 'Main Mission',
        default_blocks: {
            dialogue: {
                provider: 'inherit'
            }
        },
        bin_complete: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // 4. Test Media
    console.log('Testing Media...');
    MediaSchema.parse({
        id: 'media_999',
        name: 'hello_world',
        owner_type: 'actor',
        owner_id: 'actor_123',
        bin_id: 'bin_789',
        media_type: 'dialogue',
        prompt: 'Hello there!',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // 5. Test Take
    console.log('Testing Take...');
    TakeSchema.parse({
        id: 'take_001',
        media_id: 'media_999',
        take_number: 1,
        filename: 'hello_world_001.mp3',
        path: 'actors/john/dialogue/main_mission/hello_world_001.mp3',
        format: 'mp3',
        size_bytes: 1024,
        status: 'new',
        generation_params: {
            provider: 'elevenlabs',
            resolved_from: 'bin',
            full_settings: { provider: 'elevenlabs', voice_id: 'abc' },
            owner_type: 'actor',
            owner_id: 'actor_123',
            owner_name: 'John Doe',
            bin_name: 'Main Mission',
            generated_at: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // 6. Test Defaults
    console.log('Testing Defaults.json...');
    DefaultsSchema.parse({
        schema_version: '2.0.0',
        content_types: {
            dialogue: { provider: 'elevenlabs' },
            music: { provider: 'elevenlabs' },
            sfx: { provider: 'elevenlabs' },
            image: { provider: 'elevenlabs' }, // or whatever your hard defaults are
            video: { provider: 'elevenlabs' }
        },
        templates: {
            actor: { auto_add_blocks: ['dialogue'] }
        }
    });

    console.log('✅ All schemas validated successfully!');
} catch (error: any) {
    console.error('❌ Schema validation failed:', error.message || error);
    process.exit(1);
}
