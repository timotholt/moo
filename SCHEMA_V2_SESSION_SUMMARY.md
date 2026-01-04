# Schema V2 - Session Summary

## Date: 2026-01-04

## Objective
Refactor the MOO (Media Output Organizer) application to support multi-modal content generation (dialogue, music, sfx, image, video) with flexible ownership models and universal default blocks.

---

## Key Decisions Made

### 1. **Universal Ownership Model**
- Content can be owned by: **Actor**, **Scene**, or **Global**
- Replaces rigid `actor_id` with flexible `owner_type` + `owner_id`
- Enables:
  - Actor-specific content (John's dialogue, Sarah's portraits)
  - Scene-specific content (Battle scene music, Chapter 5 title card)
  - Global/shared content (Main theme, SFX library)

### 2. **Universal Default Blocks**
- **Every container** (Actor, Scene, Section) can have default blocks
- Default blocks are content-type-specific
- Inheritance chain: **Section → Owner → Global → Hardcoded**
- Allows fine-grained control at any level

### 3. **Content Terminology**
- **Schema**: Generic "Content" with `name` field (not `cue_id`)
- **UI**: Context-aware labels based on `content_type`:
  ```
  dialogue → "Cue" / "Cues"
  music    → "Track" / "Tracks"
  sfx      → "Sound" / "Sounds"
  image    → "Image" / "Images"
  video    → "Clip" / "Clips"
  ```
- **Philosophy**: Content is a container with settings, Takes are generated artifacts

### 4. **Hierarchical File System**
```
projects/{project_name}/
├── .moo/
│   ├── config.json
│   ├── defaults.json
│   ├── actors.jsonl
│   ├── scenes.jsonl
│   ├── sections.jsonl
│   ├── content.jsonl
│   ├── takes.jsonl
│   └── snapshots.jsonl
│
├── actors/{actor_base_filename}/{content_type}/{section_name}/{name}_{take}.{ext}
├── scenes/{scene_name}/{content_type}/{section_name}/{name}_{take}.{ext}
└── global/{content_type}/{section_name}/{name}_{take}.{ext}
```

### 5. **Full Generation Provenance**
Every take tracks:
- Full settings used (snapshot)
- Where settings came from (section/owner/global/hardcoded)
- Context (owner, section, scene names)
- API metadata (request ID, cost, latency)
- Enables "Regenerate with Same Settings" feature

---

## Files Created

### Schema Files (TypeScript + Zod)
✅ `src/shared/schemas/common.schema.ts` - Enums, shared types, DefaultBlock
✅ `src/shared/schemas/actor.schema.ts` - Actor with default_blocks
✅ `src/shared/schemas/scene.schema.ts` - Scene with default_blocks
✅ `src/shared/schemas/section.schema.ts` - Section with owner_type/owner_id
✅ `src/shared/schemas/content.schema.ts` - Content with name field
✅ `src/shared/schemas/take.schema.ts` - Take with generation_params
✅ `src/shared/schemas/defaults.schema.ts` - defaults.json structure
✅ `src/shared/schemas/index.ts` - Re-exports

### Utility Files
✅ `src/utils/contentLabels.ts` - Content-type-aware UI labels
✅ `src/utils/defaultBlockResolver.ts` - Default block inheritance logic

### Documentation
✅ `SCHEMA_V2_PLAN.md` - Comprehensive implementation plan
✅ `SCHEMA_V2_SESSION_SUMMARY.md` - This file

### Project Structure
✅ Archived old projects: `projects/` → `projects_OLD_DONT_USE/`
✅ Created fresh `projects/` folder
✅ Installed Zod for schema validation

---

## Schema Changes Summary

### Before (V1):
```javascript
// Actor
{ id, display_name, base_filename, voice_id, provider_settings }

// Section
{ id, actor_id, content_type, name }

// Content
{ id, actor_id, section_id, cue_id, content_type, prompt }

// Take
{ id, content_id, take_number, filename, status }
```

### After (V2):
```javascript
// Actor
{ id, display_name, base_filename, default_blocks, actor_complete }

// Scene (NEW)
{ id, name, description, default_blocks, scene_complete }

// Section
{ id, owner_type, owner_id, content_type, name, default_blocks, section_complete }

// Content
{ id, owner_type, owner_id, section_id, content_type, name, prompt, default_blocks }

// Take
{ id, content_id, take_number, filename, path, status, generation_params }
```

---

## Next Steps (Phase 1: Core Infrastructure)

### Immediate Tasks:
- [ ] Create path construction utility (`constructTakePath()`)
- [ ] Update project initialization to create v2 structure
- [ ] Create sample defaults.json template
- [ ] Test schema validation with sample data

### Server Updates:
- [ ] Update API routes to use Zod validation
- [ ] Implement new project creation endpoint
- [ ] Update JSONL read/write with schema validation
- [ ] Update media serving for new paths

### Client Updates:
- [ ] Update API client to use schemas
- [ ] Update UI components for owner_type
- [ ] Integrate contentLabels utility
- [ ] Update tree view for Actors/Scenes/Global

---

## Design Principles Established

1. **No Migration** - Clean start, no technical debt from old schema
2. **Schema is Generic** - UI adapts terminology, not schema
3. **Universal Containers** - Every level can have default blocks
4. **Flexible Ownership** - Content can belong to Actor, Scene, or Global
5. **Full Provenance** - Always know how content was generated
6. **Type Safety** - Zod validation on both client and server

---

## Questions Resolved

### Q: Should cues be leaves or containers?
**A:** Containers. Content (cue/clip/image/track) is a container with settings. Takes are the generated artifacts (leaves).

### Q: Should we rename "cue" in the schema?
**A:** No. Schema uses generic "Content" with `name` field. UI uses context-aware labels (Cue/Clip/Image/Track).

### Q: How do we handle multi-modal cues (same cue with dialogue + image + video)?
**A:** Keep sections type-specific. Optionally add `related_content_ids` for cross-linking later (technical debt).

### Q: Should every container have default blocks?
**A:** Yes. Universal default blocks allow maximum flexibility.

### Q: Do we need migration scripts?
**A:** No. Clean start. Import script can be created later if needed.

---

## File Path Examples

```
# Actor-owned dialogue
actors/john/dialogue/main/hello_001.mp3

# Actor-owned image
actors/john/image/portraits/neutral_001.png

# Scene-owned music
scenes/scene_03_battle/music/background/intense_001.mp3

# Scene-owned chapter title
scenes/chapter_05/image/title_cards/chapter_title_001.png

# Global SFX
global/sfx/footsteps/wood_floor_001.wav

# Global theme music
global/music/themes/main_theme_001.mp3
```

---

## Status: ✅ Foundation Complete

All schema files, utilities, and documentation are in place. Ready to proceed with implementation.
