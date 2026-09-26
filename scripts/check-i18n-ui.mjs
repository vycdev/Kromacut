import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const allowed = new Set([
    'Kromacut',
    'KROMACUT',
    'GitHub',
    'Discord',
    'Reddit',
    'Patreon',
    'HD',
    'mm',
    'mm/pixel',
    'mm · Δ',
    'F',
    '#RRGGBB',
    '#RRGGBBAA',
    'v',
]);
const attrs = new Set([
    'aria-label',
    'aria-description',
    'title',
    'alt',
    'placeholder',
    'label',
    'description',
]);
const errors = [];
const catalogs = Object.fromEntries(
    readdirSync(path.join(root, 'src/locales/en'))
        .filter((file) => file.endsWith('.json'))
        .map((file) => [
            file.slice(0, -5),
            JSON.parse(readFileSync(path.join(root, 'src/locales/en', file), 'utf8')),
        ])
);
const get = (catalog, key) => key.split('.').reduce((value, part) => value?.[part], catalog);
function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.tsx?$/.test(entry.name)) check(file);
    }
}
function check(file) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const namespaces = [
        ...new Set(
            [...source.matchAll(/useTranslation\(['"]([^'"]+)['"]\)/g)].map((match) => match[1])
        ),
    ];
    const defaultNamespace = namespaces.length === 1 ? namespaces[0] : 'common';
    const checkKey = (node, value, namespace = defaultNamespace) => {
        const [explicitNamespace, explicitKey] = value.includes(':')
            ? value.split(':')
            : [namespace, value];
        const catalog = catalogs[explicitNamespace];
        if (
            get(catalog, explicitKey) === undefined &&
            get(catalog, `${explicitKey}_other`) === undefined
        ) {
            errors.push(
                `${relative}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: missing English key ${explicitNamespace}:${explicitKey}`
            );
        }
    };
    const report = (node, value) => {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (!/[a-zA-Z]/.test(normalized) || allowed.has(normalized)) return;
        // Progress identity is a worker/UI contract; ProgressOverlay translates at render time.
        if (
            relative === 'src/App.tsx' &&
            ['Preparing 3D workspace', 'Preparing 3D model'].includes(normalized)
        )
            return;
        errors.push(
            `${relative}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${normalized}`
        );
    };
    // Text expressed through ternaries/string literals needs the same scrutiny as
    // bare JSX text. Do not inspect function arguments: t('key') is not UI prose.
    function checkDisplayedExpression(node) {
        if (!node) return;
        if (ts.isStringLiteralLike(node)) report(node, node.text);
        else if (ts.isConditionalExpression(node)) {
            checkDisplayedExpression(node.whenTrue);
            checkDisplayedExpression(node.whenFalse);
        } else if (ts.isBinaryExpression(node)) checkDisplayedExpression(node.right);
        else if (ts.isTemplateExpression(node)) {
            report(node, node.head.text);
            for (const span of node.templateSpans) report(span.literal, span.literal.text);
        }
    }
    function visit(node) {
        if (ts.isJsxText(node)) report(node, node.text);
        if (
            ts.isJsxAttribute(node) &&
            attrs.has(node.name.getText(ast)) &&
            node.initializer &&
            ts.isStringLiteral(node.initializer)
        )
            report(node, node.initializer.text);
        if (
            ts.isJsxExpression(node) &&
            (!ts.isJsxAttribute(node.parent) || attrs.has(node.parent.name.getText(ast)))
        )
            checkDisplayedExpression(node.expression);
        if (
            ts.isCallExpression(node) &&
            ['t', 'translate', 'i18n.t'].includes(node.expression.getText(ast))
        ) {
            const key = node.arguments[0];
            if (key && ts.isStringLiteralLike(key))
                checkKey(
                    key,
                    key.text,
                    node.expression.getText(ast) === 't' ? defaultNamespace : 'common'
                );
        }
        if (
            (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
            node.tagName.getText(ast) === 'Trans'
        ) {
            const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
            const key = attributes.find(
                (attribute) => attribute.name.getText(ast) === 'i18nKey'
            )?.initializer;
            const namespace = attributes.find(
                (attribute) => attribute.name.getText(ast) === 'ns'
            )?.initializer;
            if (key && ts.isStringLiteral(key))
                checkKey(
                    key,
                    key.text,
                    namespace && ts.isStringLiteral(namespace) ? namespace.text : defaultNamespace
                );
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
}
walk(path.join(root, 'src'));
for (const file of readdirSync(path.join(root, 'src/assets/diagrams')).filter((file) =>
    file.endsWith('.svg')
)) {
    const svg = readFileSync(path.join(root, 'src/assets/diagrams', file), 'utf8');
    for (const match of svg.matchAll(/<(text|title|desc)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
        const key = match[2].match(/\bdata-i18n="([^"]+)"/)?.[1];
        const content = match[3].replace(/<[^>]+>/g, '').trim();
        if (!key && /[A-Za-z]{2,}/.test(content) && !/^[-\d\s.,+%]*\s?mm$/.test(content)) {
            errors.push(`src/assets/diagrams/${file}: uncatalogued SVG text: ${content}`);
        }
        if (key && typeof catalogs.diagrams[file.slice(0, -4)]?.[key] !== 'string') {
            errors.push(`src/assets/diagrams/${file}: missing English diagram key ${key}`);
        }
    }
}
if (errors.length) {
    console.error(`Translation source coverage errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
} else
    console.log(
        'Static UI text, attributes, and literal translation keys are catalogued (brand/unit/progress-contract exceptions documented).'
    );
