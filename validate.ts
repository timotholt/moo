import { readJsonl } from './src/utils/jsonl.js';
import { ActorSchema, BinSchema, MediaSchema } from './src/shared/schemas/index.js';
import { getProjectPaths } from './src/utils/paths.js';
import { join } from 'path';

const projectRoot = join(process.cwd(), 'projects', 'fireteam');
const paths = getProjectPaths(projectRoot);

async function check() {
  try {
    console.log('Validating actors...');
    const actors = await readJsonl(paths.catalog.actors, ActorSchema);
    console.log(`Successfully parsed ${actors.length} actors.`);

    console.log('Validating bins...');
    const bins = await readJsonl(paths.catalog.bins, BinSchema);
    console.log(`Successfully parsed ${bins.length} bins.`);

    console.log('Validating media...');
    const media = await readJsonl(paths.catalog.media, MediaSchema);
    console.log(`Successfully parsed ${media.length} media items.`);
    
    console.log('Done validating schema!');
  } catch (error) {
    console.error("VALIDATION ERROR:", error);
  }
}

check();
