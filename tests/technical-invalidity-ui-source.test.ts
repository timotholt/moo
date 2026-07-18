import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';

describe('technical invalidity media UI', () => {
  it('shows diagnostics and disables approval and selection for invalid takes', async () => {
    const mediaView = await fs.readFile('src/ui-solid/components/MediaView.jsx', 'utf8');
    const preview = await fs.readFile('src/ui-solid/components/TakePreview.jsx', 'utf8');

    expect(mediaView).toContain("take.technical_status === 'invalid'");
    expect(mediaView).toContain('Technically invalid takes cannot be approved');
    expect(mediaView).toContain('Technically invalid takes cannot be selected');
    expect(mediaView).toContain('technical_issues');
    expect(preview).toContain('Technically invalid candidate');
    expect(preview).toContain('technicalIssues');
  });
});
