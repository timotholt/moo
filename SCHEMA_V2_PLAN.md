# Schema V2 Implementation Plan

## Overview
Complete refactor to support multi-modal content (dialogue, music, sfx, image, video) with flexible ownership (Actor, Scene, Global) and universal default blocks.

## Key Changes

### 1. **Universal Ownership Model**
- Content can be owned by: Actor, Scene, or Global
- Replaces `actor_id` with `owner_type` + `owner_id`
- Enables scene-specific content (backgrounds, music) and shared assets

### 2. **Universal Default Blocks**
- Every container (Actor, Scene, Section) can have default blocks
- Default blocks are content-type-specific (dialogue, image, video, etc.)
- Inheritance chain: Section → Owner (Actor/Scene) → Global → Hardcoded

### 3. **File System Layout**
```
projects/
└── {project_name}/
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
    ├── actors/
    │   └── {actor_base_filename}/
    │       └── {content_type}/
    │           └── {section_name}/
    │               └── {cue_id}_{take_number}.{ext}
    │
    ├── scenes/
    │   └── {scene_name}/
    │       └── {content_type}/
    │           └── {section_name}/
    │               └── {cue_id}_{take_number}.{ext}
    │
    └── global/
        └── {content_type}/
            └── {section_name}/
                └── {cue_id}_{take_number}.{ext}
```

### 4. **Enhanced Metadata Tracking**
- Full generation provenance in `generation_params`
- Tracks: settings used, where they came from, context (owner, section, scene)
- Enables "Regenerate with Same Settings" feature

### 5. **Content Terminology**
- **Schema**: Uses generic term "Content" with `name` field
- **UI**: Context-aware labels based on `content_type`:
  - `dialogue` → "Cue" / "Cues"
  - `music` → "Track" / "Tracks"
  - `sfx` → "Sound" / "Sounds"
  - `image` → "Image" / "Images"
  - `video` → "Clip" / "Clips"
- **Hierarchy**: Content is a container with settings, Takes are generated artifacts

## Schema Files Created

✅ `src/shared/schemas/common.schema.ts` - Enums and shared types
✅ `src/shared/schemas/actor.schema.ts` - Actor with default_blocks
✅ `src/shared/schemas/scene.schema.ts` - Scene with default_blocks
✅ `src/shared/schemas/section.schema.ts` - Section with owner_type/owner_id
✅ `src/shared/schemas/content.schema.ts` - Content with owner_type/owner_id
✅ `src/shared/schemas/take.schema.ts` - Take with full generation_params
✅ `src/shared/schemas/defaults.schema.ts` - defaults.json structure
✅ `src/shared/schemas/index.ts` - Re-exports

## Next Steps

### Phase 1: Core Infrastructure
- [ ] Verify Zod installation
- [ ] Create default block resolution utility
- [ ] Update path construction utilities
- [ ] Create project initialization logic

### Phase 2: Server Updates
- [ ] Update all API routes to use Zod validation
- [ ] Implement new project creation with v2 structure
- [ ] Update JSONL read/write to validate schemas
- [ ] Update media serving for new paths

### Phase 3: Client Updates
- [ ] Update API client to use schemas
- [ ] Update UI components to handle owner_type
- [ ] Add default blocks editor components
- [ ] Update tree view for Actors/Scenes/Global

### Phase 4: UI Enhancements
- [ ] Create GroupView for all container types
- [ ] Add "Add Default Block" UI
- [ ] Show generation metadata in take details
- [ ] Add "Regenerate with Same Settings" button

## Migration Notes

**NO MIGRATION NEEDED** - Clean start approach:
- Old projects moved to `projects_OLD_DONT_USE/`
- New projects use v2 schema from day 1
- Import script can be created later if needed (technical debt)

## Testing Checklist

- [ ] Create new project
- [ ] Create Actor with dialogue default block
- [ ] Create Scene with music default block
- [ ] Create Global section with SFX
- [ ] Generate content and verify paths
- [ ] Verify metadata tracking
- [ ] Test inheritance chain
- [ ] Test completion tracking

## File Paths Examples

```
# Actor-owned dialogue
actors/john/dialogue/main/hello_001.mp3

# Actor-owned image
actors/john/image/portraits/neutral_001.png

# Scene-owned music
scenes/scene_03_battle/music/background/intense_001.mp3

# Scene-owned image (chapter title)
scenes/chapter_05/image/title_cards/chapter_title_001.png

# Global SFX
global/sfx/footsteps/wood_floor_001.wav

# Global music theme
global/music/themes/main_theme_001.mp3
```

## Schema Version

All new projects will have:
- `config.json` → `schema_version: "2.0.0"`
- `defaults.json` → `schema_version: "2.0.0"`

This allows for future schema evolution and validation.
