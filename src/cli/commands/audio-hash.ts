import { Command } from 'commander';
import { hashFile, verifyHash } from '../../services/audio/hash.js';

export const audioHashCommand = new Command()
    .command('audio hash <file>')
    .description('Compute SHA-256 hash of a file and store in .sha256 (or verify existing)')
    .option('-v, --verify', 'Verify existing hash instead of computing')
    .action(async (file: string, options) => {
        try {
            if (options.verify) {
                const ok = await verifyHash(file);
                console.log(ok ? 'Hash matches' : 'Hash mismatch');
            } else {
                const hash = await hashFile(file);
                console.log(`SHA-256: ${hash}`);
            }
        } catch (err) {
            console.error('Error hashing file:', err);
            process.exit(1);
        }
    });
