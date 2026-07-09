const KEY = 'kromacut.ui.collapsedGroups.v1';

export function loadCollapsedGroups(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const groups: Record<string, boolean> = {};
        for (const [id, collapsed] of Object.entries(parsed)) {
            if (typeof collapsed === 'boolean') groups[id] = collapsed;
        }
        return groups;
    } catch {
        return {};
    }
}

export function isGroupCollapsed(id: string): boolean {
    return loadCollapsedGroups()[id] === true;
}

export function setGroupCollapsed(id: string, collapsed: boolean): void {
    try {
        const groups = loadCollapsedGroups();
        if (collapsed) {
            groups[id] = true;
        } else {
            delete groups[id];
        }
        localStorage.setItem(KEY, JSON.stringify(groups));
    } catch {
        // Storage unavailable; the in-memory React state still tracks the session.
    }
}
