/**
 * Serialize mutations for one local project within the MOO server process.
 *
 * This complements atomic JSONL replacement: a writer cannot overwrite a
 * catalog snapshot that another request read before it finished updating it.
 */
export class ProjectWriteLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async acquire(projectKey: string): Promise<() => void> {
    const previous = this.tails.get(projectKey) ?? Promise.resolve();
    let unlockCurrent!: () => void;
    const current = new Promise<void>((resolve) => { unlockCurrent = resolve; });
    const queued = previous.then(() => current);
    this.tails.set(projectKey, queued);
    await previous;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlockCurrent();
      if (this.tails.get(projectKey) === queued) this.tails.delete(projectKey);
    };
  }
}
