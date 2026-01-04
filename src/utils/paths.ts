import { join } from 'path';

export const PATHS = {
    CATALOG: 'catalog',
    MEDIA: 'media',
    EXPORTS: 'exports',
    SCHEMA: 'schema',
    SCRIPTS: 'scripts',
    MOO: '.moo',
    INDEXES: 'catalog/indexes',
} as const;

export function getProjectPaths(projectRoot: string) {
    return {
        root: projectRoot,
        projectJson: join(projectRoot, 'project.json'),
        catalog: {
            actors: join(projectRoot, PATHS.CATALOG, 'actors.jsonl'),
            content: join(projectRoot, PATHS.CATALOG, 'content.jsonl'),
            sections: join(projectRoot, PATHS.CATALOG, 'sections.jsonl'),
            scenes: join(projectRoot, PATHS.CATALOG, 'scenes.jsonl'),
            takes: join(projectRoot, PATHS.CATALOG, 'takes.jsonl'),
            generationJobs: join(projectRoot, PATHS.CATALOG, 'generation-jobs.jsonl'),
            indexes: {
                dir: join(projectRoot, PATHS.INDEXES),
                byActor: (id: string) => join(projectRoot, PATHS.INDEXES, `by_actor`, `${id}.json`),
                byContent: (id: string) => join(projectRoot, PATHS.INDEXES, `by_content`, `${id}.json`),
            },
        },
        media: join(projectRoot, PATHS.MEDIA),
        exports: join(projectRoot, PATHS.EXPORTS),
        moo: {
            dir: join(projectRoot, PATHS.MOO),
            auditLog: join(projectRoot, PATHS.MOO, 'audit.log'),
            config: join(projectRoot, PATHS.MOO, 'config.json'),
        },
    };
}
