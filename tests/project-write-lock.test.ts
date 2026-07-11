import { describe, expect, it } from 'vitest';
import { ProjectWriteLocks } from '../src/services/project-write-lock.js';

describe('ProjectWriteLocks', () => {
  it('serializes writes for the same project without blocking another project', async () => {
    const locks = new ProjectWriteLocks();
    const firstRelease = await locks.acquire('project-a');
    let secondEntered = false;
    const second = locks.acquire('project-a').then((release) => { secondEntered = true; release(); });
    const otherRelease = await locks.acquire('project-b');
    expect(secondEntered).toBe(false);
    otherRelease();
    firstRelease();
    await second;
    expect(secondEntered).toBe(true);
  });
});
