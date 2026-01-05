import { join } from 'path';

/**
 * Project Path Structure (V2)
 * 
 * {projectRoot}/
 * ├── .moo/                <-- Catalog and Metadata
 * │   ├── config.json
 * │   ├── defaults.json    (Note: actually in root in some drafts, but here is safer)
 * │   ├── actors.jsonl
 * │   ├── scenes.jsonl
 * │   ├── sections.jsonl
 * │   ├── content.jsonl
 * │   ├── takes.jsonl
 * │   └── snapshots.jsonl
 * │
 * ├── actors/              <-- Media Folders
 * ├── scenes/
 * └── global/
 */

export function getProjectPaths(projectRoot: string) {
    const mooDir = join(projectRoot, '.moo');

    return {
        root: projectRoot,

        // Catalog files (inside .moo/)
        catalog: {
            actors: join(mooDir, 'actors.jsonl'),
            scenes: join(mooDir, 'scenes.jsonl'),
            bins: join(mooDir, 'bins.jsonl'),
            media: join(mooDir, 'media.jsonl'),
            takes: join(mooDir, 'takes.jsonl'),
            snapshots: join(mooDir, 'snapshots.jsonl'),
            redoSnapshots: join(mooDir, 'redo-snapshots.jsonl'),
        },

        // Media folders (at root)
        media: {
            actors: join(projectRoot, 'actors'),
            scenes: join(projectRoot, 'scenes'),
            global: join(projectRoot, 'global'),
            exports: join(projectRoot, 'exports'),
        },

        // Metadata and Config
        moo: {
            dir: mooDir,
            config: join(mooDir, 'config.json'),
            defaults: join(projectRoot, 'defaults.json'),
        },
    };
}
