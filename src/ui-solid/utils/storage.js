
/**
 * Project-scoped localStorage utility
 */
export const getProjectKey = (projectName, key) => `moo-p[${projectName}]-${key}`;

export const storage = {
    set: (projectName, key, value) => {
        if (!projectName) return;
        localStorage.setItem(getProjectKey(projectName, key), JSON.stringify(value));
    },
    get: (projectName, key, defaultValue = null) => {
        if (!projectName) return defaultValue;
        try {
            const saved = localStorage.getItem(getProjectKey(projectName, key));
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (e) {
            console.warn(`[Storage] Failed to parse key ${key} for project ${projectName}`, e);
            return defaultValue;
        }
    },
    remove: (projectName, key) => {
        if (!projectName) return;
        localStorage.removeItem(getProjectKey(projectName, key));
    },
    // Clear all keys for a specific project
    clearProject: (projectName) => {
        if (!projectName) return;
        const prefix = `moo-p[${projectName}]-`;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log(`[Storage] Cleared all data for project: ${projectName}`);
    }
};
