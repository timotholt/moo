/**
 * Resolves settings blocks through the hierarchy:
 * Item -> Bin -> Actor/Scene -> Project Defaults
 */
export function getInheritedSettings(mediaType, hierarchy) {
    // hierarchy: { item?, bin?, owner?, projectDefaults? }
    
    // We start with project defaults as the absolute base
    const base = hierarchy.projectDefaults?.[mediaType] || {};
    
    // Then owner (Actor/Scene)
    const ownerBlock = hierarchy.owner?.default_blocks?.[mediaType] || {};
    const ownerResolved = mergeBlocks(base, ownerBlock);
    
    // Then Bin
    const binBlock = hierarchy.bin?.default_blocks?.[mediaType] || {};
    const binResolved = mergeBlocks(ownerResolved, binBlock);
    
    // Then Item (Media)
    // NOTE: For the MediaView, the 'inherited' settings are actually everything ABOVE it.
    // The MediaView's OWN block is what the user is currently editing.
    return binResolved;
}

function mergeBlocks(parent, child) {
    // If child is 'inherit' (or empty/null), it uses parent.
    // In our system, we use 'provider: inherit' as a signal.
    if (!child || child.provider === 'inherit' || Object.keys(child).length === 0) {
        return parent;
    }
    
    // Otherwise, it overrides. 
    // Currently, our UI treats the whole block as an override if it's set to 'custom'.
    // But we could implement field-level inheritance if we wanted.
    // Let's stick to block-level override for now as per ProviderSettingsEditor.jsx logic.
    return child;
}
