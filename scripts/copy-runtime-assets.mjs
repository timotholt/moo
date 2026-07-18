#!/usr/bin/env node

import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceTemplates = join(root, 'src', 'templates');
const destinationTemplates = join(root, 'dist', 'templates');

await mkdir(destinationTemplates, { recursive: true });
await cp(sourceTemplates, destinationTemplates, { recursive: true, force: true });
