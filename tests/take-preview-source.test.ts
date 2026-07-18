import fs from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewSource = fs.readFileSync(resolve(process.cwd(), 'src/ui-solid/components/TakePreview.jsx'), 'utf8');
const mediaViewSource = fs.readFileSync(resolve(process.cwd(), 'src/ui-solid/components/MediaView.jsx'), 'utf8');

describe('first-class visual take previews', () => {
  it('renders accessible image and video previews with loading and error states', () => {
    expect(previewSource).toContain('<img');
    expect(previewSource).toContain('<video');
    expect(previewSource).toContain('controls');
    expect(previewSource).toContain('playsInline');
    expect(previewSource).toContain('onLoadedMetadata');
    expect(previewSource).toContain('onError');
    expect(previewSource).toContain('Loading preview');
    expect(previewSource).toContain('Could not load preview');
  });

  it('uses a checkerboard for images and reports transparency without guessing', () => {
    expect(previewSource).toContain("data-preview-background={isImage() ? 'checkerboard' : 'neutral-dark'}");
    expect(previewSource).toContain('backgroundImage');
    expect(previewSource).toContain('Transparency: verified');
    expect(previewSource).toContain('Transparency: requested, verification unknown');
    expect(previewSource).toContain('Transparency: unknown');
  });

  it('encodes media path segments while preserving path separators', () => {
    expect(previewSource).toContain('export function mediaUrlForPath');
    expect(previewSource).toContain(".split('/')");
    expect(previewSource).toContain('.map(segment => encodeURIComponent(segment))');
    expect(previewSource).toContain("return `/media/${encodedPath}`");
  });

  it('expands visual rows while preserving the current audio playback route', () => {
    expect(mediaViewSource).toContain("props.item.media_type === 'image' || props.item.media_type === 'video'");
    expect(mediaViewSource).toContain('setExpandedTakeId(expandedTakeId() === take.id ? null : take.id)');
    expect(mediaViewSource).toContain('handlePlayTake(take)');
    expect(mediaViewSource).toContain('playback.onPlayRequest(props.item.id, take)');
    expect(mediaViewSource).toContain('<TakePreview take={take} mediaType={props.item.media_type} />');
    expect(mediaViewSource).not.toMatch(/from ['"]react['"]/i);
    expect(previewSource).not.toMatch(/from ['"]react['"]/i);
  });
});
