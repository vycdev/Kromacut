import { i18n } from './i18n.ts';

type MessagePattern = {
    key: string;
    prefix: string;
    expression: RegExp;
    names: string[];
    specificity: number;
};
const exactMessages = new Map<string, string>();
const patterns: MessagePattern[] = [];

function escapePattern(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indexMessages(catalog: Record<string, unknown>, namespace: string, path = ''): void {
    for (const [name, value] of Object.entries(catalog)) {
        const key = path ? `${path}.${name}` : name;
        if (value && typeof value === 'object') {
            indexMessages(value as Record<string, unknown>, namespace, key);
            continue;
        }
        if (typeof value !== 'string') continue;
        const slots = [...value.matchAll(/{{\s*(\w+)\s*}}/g)];
        if (!slots.length) {
            exactMessages.set(value, `${namespace}:${key}`);
            continue;
        }
        // UI-only composition templates such as "{{title}}: {{step}}" or
        // "{{step}} of {{total}}" also match unrelated OS/JSON diagnostics.
        // Only the dedicated runtime catalog may begin with an unconstrained
        // slot; other namespaces need a literal prefix that identifies the
        // complete message. Those generic UI templates use t() directly.
        if (namespace !== 'messages' && slots[0].index === 0) continue;
        let expression = '^';
        let position = 0;
        for (const slot of slots) {
            expression += `${escapePattern(value.slice(position, slot.index))}([\\s\\S]*?)`;
            position = slot.index! + slot[0].length;
        }
        expression += `${escapePattern(value.slice(position))}$`;
        patterns.push({
            key: `${namespace}:${key}`,
            prefix: value.slice(0, slots[0].index),
            expression: new RegExp(expression),
            names: slots.map((slot) => slot[1]),
            specificity: value.length - slots.reduce((length, slot) => length + slot[0].length, 0),
        });
    }
}
for (const namespace of ['messages', 'common', 'workspace', 'printing', 'calibration']) {
    indexMessages(i18n.getResourceBundle('en', namespace), namespace);
}
// Match full instructions before shorter templates that could swallow their suffix.
patterns.sort((left, right) => right.specificity - left.specificity);

/**
 * Compatibility boundary for existing worker/status/error strings. Only explicitly
 * catalogued complete messages are translated. Protocols and stored data stay English;
 * unknown OS errors, user content, filenames and diagnostic details remain untouched.
 * Call at display time so switching language does not restart a computation.
 */
export function translateRuntimeMessage(message: string): string {
    return translateMessage(message, 0);
}

function translateMessage(message: string, depth: number): string {
    if (depth > 4) return message;
    const exact = exactMessages.get(message);
    if (exact) return translateCatalogMessage(exact, {});
    if (
        /^\d+ (?:imported|overwritten|renamed|skipped \(duplicates\))(?:, \d+ (?:imported|overwritten|renamed|skipped \(duplicates\)))*$/.test(
            message
        )
    ) {
        return message
            .split(', ')
            .map((part) => translateImportPart(part))
            .join(', ');
    }
    for (const { key, prefix, expression, names } of patterns) {
        if (!message.startsWith(prefix)) continue;
        const match = expression.exec(message);
        if (!match) continue;
        const parameters: Record<string, string | number> = {};
        names.forEach((name, index) => {
            const value = match[index + 1];
            parameters[name] =
                name === 'count' && /^\d+$/.test(value)
                    ? Number(value)
                    : ['label', 'error', 'message', 'details'].includes(name)
                      ? value
                            .split('; ')
                            .map((part) => translateMessage(part, depth + 1))
                            .join('; ')
                      : value;
        });
        return translateCatalogMessage(key, parameters);
    }
    return message;
}

function translateImportPart(part: string): string {
    const match = /^(\d+) (imported|overwritten|renamed|skipped \(duplicates\))$/.exec(part)!;
    const key = match[2].startsWith('skipped') ? 'skipped' : match[2];
    return i18n.t(`messages:import.${key}`, { count: Number(match[1]) });
}

function translateCatalogMessage(key: string, parameters: Record<string, string | number>): string {
    const plural = /_(zero|one|two|few|many|other)$/.exec(key);
    if (plural) {
        const base = key.slice(0, -plural[0].length);
        if (i18n.exists(`${base}_other`, { lng: 'en' })) {
            const count = parameters.count ?? (plural[1] === 'one' ? 1 : undefined);
            if (typeof count === 'number') return i18n.t(base, { ...parameters, count });
        }
    }
    return i18n.t(key, parameters);
}
