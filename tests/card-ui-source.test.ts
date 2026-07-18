import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('SolidJS card authoring UI source', () => {
  it('exposes schema-validated card CRUD through the UI API client', () => {
    const client = source('src/ui-solid/api/client.ts');

    expect(client).toContain('CardSchema');
    expect(client).toContain("fetchJson('/api/cards')");
    expect(client).toContain("fetch('/api/cards'");
    expect(client).toContain("method: 'POST'");
    expect(client).toContain('`/api/cards/${encodeURIComponent(id)}`');
    expect(client).toContain("method: 'PUT'");
    expect(client).toContain("method: 'DELETE'");
    expect(client).toContain('`/api/cards/${encodeURIComponent(id)}/render`');
    expect(client).toContain('CardSchema.parse(data.card)');
  });

  it('loads cards with project data and passes them through tree and detail panes', () => {
    const shell = source('src/ui-solid/components/ProjectShell.jsx');

    expect(shell).toContain('getCards');
    expect(shell).toContain('const [cards, setCards] = createSignal([])');
    expect(shell).toContain('getCards()');
    expect(shell).toContain('setCards(cardsRes.cards || [])');
    expect(shell.match(/cards=\{cards\(\)\}/g)).toHaveLength(2);
  });

  it('makes cards selectable and resolves card owners for bins, media, and groups', () => {
    const tree = source('src/ui-solid/components/TreePane.jsx');
    const detail = source('src/ui-solid/components/DetailPane.jsx');
    const engine = source('src/ui-solid/utils/viewEngine.js');

    expect(tree).toContain("id: 'cards'");
    expect(tree).toContain("nodeType: 'card'");
    expect(tree).toContain('cards: props.cards || []');
    expect(detail).toContain("case 'card'");
    expect(detail).toContain("bin?.owner_type === 'card'");
    expect(detail).toContain("item?.owner_type === 'card'");
    expect(detail).toContain("typeOverride: 'card'");
    expect(detail).toContain('<CardView');
    expect(engine).toContain("card: 'Cards'");
    expect(engine).toContain("m.owner_type === 'card'");
    expect(engine).toContain("b.owner_type === 'card'");
    expect(engine).toContain('owner_name: card.name');
    expect(engine).toContain("owner_type: 'card'");
  });

  it('creates cards from the root and provides structured, schema-backed slot editing', () => {
    const rootView = source('src/ui-solid/components/views/RootView.jsx');
    const cardView = source('src/ui-solid/components/views/CardView.jsx');

    expect(rootView).toContain('createCard({ name })');
    expect(rootView).toContain("{ type: 'card', id: result.card.id }");
    expect(cardView).toContain('CardSchema.safeParse');
    expect(cardView).toContain('Rules');
    expect(cardView).toContain('Gameplay metadata');
    expect(cardView).toContain('Asset slots');
    expect(cardView).toContain('Slot key');
    expect(cardView).toContain('Asset kind');
    expect(cardView).toContain('Required');
    expect(cardView).toContain('Media assignment');
    expect(cardView).toContain('Format');
    expect(cardView).toContain('Width');
    expect(cardView).toContain('Height');
    expect(cardView).toContain('Transparency');
    expect(cardView).toContain('Video ratio');
    expect(cardView).toContain("value=\"16:9\"");
    expect(cardView).toContain("value=\"9:16\"");
    expect(cardView).toContain('Render card');
    expect(cardView).toContain('renderCard(props.card.id)');
    expect(cardView).toContain('mediaUrlForPath(rendered().file)');
    expect(cardView).not.toContain('<textarea');
    expect(cardView).not.toContain('React');
  });
});
