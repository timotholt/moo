import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ErrorObject } from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ajv export is messy in ESM/TS
const AjvClass = Ajv.default || Ajv;
const ajv = new AjvClass({ allErrors: true });
// ajv-formats export is messy in ESM/TS
const addFormatsFn = addFormats.default || addFormats;
addFormatsFn(ajv);

// Load schemas
const schemaDir = join(__dirname, '../schemas');
const schemaFiles = [
    'project.json',
    'actor.json',
    'content.json',
    'take.json',
    'review.json',
];

// Synchronously load schemas for simplicity in this utility
for (const file of schemaFiles) {
    const schemaPath = join(schemaDir, file);
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readJsonSync(schemaPath);
        // Use the file name (without ext) as the key or the $id if present
        // The spec schemas don't have $id, so we'll use the filename key
        const key = file.replace('.json', '');
        ajv.addSchema(schema, key);
    }
}

export function validate<T>(schemaKey: string, data: T): { valid: boolean; errors?: string[] } {
    const validateFn = ajv.getSchema(schemaKey);
    if (!validateFn) {
        throw new Error(`Schema not found: ${schemaKey}`);
    }

    const valid = validateFn(data);
    if (!valid) {
        return {
            valid: false,
            errors: validateFn.errors?.map((e: ErrorObject) => `${e.instancePath} ${e.message}`) || ['Unknown error'],
        };
    }

    return { valid: true };
}
