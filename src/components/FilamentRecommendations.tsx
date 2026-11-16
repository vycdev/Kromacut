import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { RecommendationSession } from '../lib/projectFile';
import { FILAMENT_CATALOG, recommendFilaments } from '../lib/filamentRecommendations';

interface Props {
    initial?: RecommendationSession | null;
    onSessionChange?: (state: RecommendationSession) => void;
    swatches: { hex: string; a: number; count: number; isTransparent?: boolean }[];
    onPreview: (colors: Record<string, string>) => void;
    onApply: () => Promise<void>;
    onSave: (
        name: string,
        colors: string[],
        disabled?: number[],
        names?: string[]
    ) => boolean | void;
}

export default function FilamentRecommendations({
    swatches,
    onSave,
    onPreview,
    onApply,
    initial,
    onSessionChange,
}: Props) {
    const { t } = useTranslation('workspace');
    const [open, setOpen] = useState<string | null>(null);
    const brands = [...new Set(FILAMENT_CATALOG.map((f) => f.brand))];
    const [checkedBrands, setCheckedBrands] = useState<string[]>(initial?.checkedBrands ?? brands);
    const [material, setMaterial] = useState(initial?.material ?? 'PLA');
    const [chosen, setChosen] = useState<Record<string, string>>(initial?.chosen ?? {});
    useEffect(() => {
        onSessionChange?.({ checkedBrands, material, chosen });
    }, [checkedBrands, material, chosen, onSessionChange]);
    const [saved, setSaved] = useState(false);
    const [applying, setApplying] = useState(false);
    const [selectedClosest, setSelectedClosest] = useState(false);
    const targets = useMemo(
        () =>
            [
                ...new Set(
                    swatches
                        .filter((s) => s.a > 0 && !s.isTransparent)
                        .sort((a, b) => b.count - a.count)
                        .map((s) => s.hex.toUpperCase())
                ),
            ].slice(0, 32),
        [swatches]
    );
    const rows = useMemo(
        () =>
            targets.map((hex) => ({
                hex,
                matches: recommendFilaments(hex, checkedBrands, material),
            })),
        [targets, checkedBrands, material]
    );
    const picks = rows.map((row) => row.matches.find((m) => m.id === chosen[row.hex]));
    useEffect(() => {
        onPreview(
            Object.fromEntries(
                rows.flatMap((row) => {
                    const pick = row.matches.find((m) => m.id === chosen[row.hex]);
                    return pick ? [[row.hex, pick.hex]] : [];
                })
            )
        );
    }, [rows, chosen, onPreview]);
    const resetChoices = () => {
        setChosen({});
        setSaved(false);
        setSelectedClosest(false);
    };
    const btn = 'border rounded px-2 py-1 disabled:opacity-40';

    return (
        <section className="rounded border p-3 space-y-3" data-testid="filament-recommender">
            <h3 className="font-semibold">{t('recommend.title')}</h3>
            <p className="text-sm text-muted-foreground">
                {t('recommend.select')} {t('recommend.limit')}
            </p>
            <div className="grid grid-cols-2 gap-2">
                <div className="text-sm">
                    <span>{t('recommend.brand')}</span>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                aria-label={t('recommend.brand')}
                                className="block w-full bg-background border rounded p-1 text-left"
                            >
                                {checkedBrands.length === brands.length
                                    ? t('recommend.allBrands')
                                    : t('recommend.brandCount', { count: checkedBrands.length })}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            className="w-60 space-y-2"
                            aria-label={t('recommend.brand')}
                        >
                            <label className="flex gap-2 items-center">
                                <input
                                    type="checkbox"
                                    checked={checkedBrands.length === brands.length}
                                    onChange={(e) => {
                                        setCheckedBrands(e.target.checked ? brands : []);
                                        resetChoices();
                                    }}
                                />
                                {t('recommend.allBrands')}
                            </label>
                            {brands.map((brand) => (
                                <label key={brand} className="flex gap-2 items-center">
                                    <input
                                        type="checkbox"
                                        checked={checkedBrands.includes(brand)}
                                        onChange={(e) => {
                                            setCheckedBrands((prev) =>
                                                e.target.checked
                                                    ? [...prev, brand]
                                                    : prev.filter((b) => b !== brand)
                                            );
                                            resetChoices();
                                        }}
                                    />
                                    {brand}
                                </label>
                            ))}
                        </PopoverContent>
                    </Popover>
                </div>
                <label className="text-sm">
                    {t('recommend.material')}
                    <select
                        aria-label={t('recommend.material')}
                        className="block w-full bg-background border rounded p-1"
                        value={material}
                        onChange={(e) => {
                            setMaterial(e.target.value);
                            resetChoices();
                        }}
                    >
                        {[...new Set(FILAMENT_CATALOG.map((f) => f.material))].map((m) => (
                            <option key={m}>{m}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-auto p-1">
                {rows.map(({ hex, matches }) => {
                    const pick = matches.find((m) => m.id === chosen[hex]);
                    return (
                        <Popover
                            key={hex}
                            open={open === hex}
                            onOpenChange={(isOpen) => {
                                setOpen((previous) =>
                                    isOpen ? hex : previous === hex ? null : previous
                                );
                            }}
                        >
                            <PopoverTrigger asChild>
                                <button
                                    aria-label={t('recommend.target', { hex })}
                                    aria-pressed={open === hex}
                                    data-preview-hex={pick?.hex ?? hex}
                                    title={
                                        pick
                                            ? `${hex} → ${pick.brand} ${pick.name} ${pick.hex}`
                                            : hex
                                    }
                                    className={`w-7 h-7 rounded border-2 ${open === hex ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-muted'}`}
                                    style={{ background: pick?.hex ?? hex }}
                                />
                            </PopoverTrigger>
                            <PopoverContent
                                side="top"
                                align="start"
                                collisionPadding={12}
                                className="w-[360px] max-w-[calc(100vw-24px)] p-3 space-y-3"
                                data-testid="filament-match-row"
                                aria-label={t('recommend.matches')}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-6 h-6 border rounded"
                                        style={{ background: hex }}
                                    />
                                    <strong className="text-sm">{hex}</strong>
                                </div>
                                <p className="text-xs">
                                    {t('recommend.matches')} · {t('recommend.order')}
                                </p>
                                {!matches.length && (
                                    <p className="text-sm">{t('recommend.noMatches')}</p>
                                )}
                                <div
                                    className="grid grid-cols-10 gap-1"
                                    role="radiogroup"
                                    aria-label={hex}
                                    data-testid="filament-match-options"
                                >
                                    {matches.map((match, rank) => (
                                        <button
                                            key={match.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={pick?.id === match.id}
                                            aria-label={`${hex}: ${match.brand} ${match.line} ${match.name}`}
                                            title={`#${rank + 1} ${match.brand} · ${match.line} · ${match.name}\n${match.hex} · ${t('recommend.score', { value: match.difference.toFixed(2) })}`}
                                            className={`aspect-square w-full min-w-0 rounded border ${pick?.id === match.id ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-muted-foreground/40'}`}
                                            style={{ background: match.hex }}
                                            onClick={() => {
                                                setChosen((prev) => ({
                                                    ...prev,
                                                    [hex]: prev[hex] === match.id ? '' : match.id,
                                                }));
                                                setSaved(false);
                                                setSelectedClosest(false);
                                            }}
                                        />
                                    ))}
                                </div>
                                {!pick && !!matches.length && (
                                    <p className="text-xs">{t('recommend.chooseMatch')}</p>
                                )}
                                {pick && (
                                    <div
                                        className="text-xs space-y-1"
                                        data-testid="chosen-filament"
                                    >
                                        <p>
                                            <strong>{pick.name}</strong> · {pick.brand} ·{' '}
                                            {pick.line}
                                        </p>
                                        <p>
                                            {pick.hex} ·{' '}
                                            {t('recommend.score', {
                                                value: pick.difference.toFixed(2),
                                            })}
                                        </p>
                                        {pick.sourceUrl && (
                                            <a
                                                href={pick.sourceUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="underline"
                                            >
                                                {t(
                                                    pick.sourceKind === 'community'
                                                        ? 'recommend.communitySource'
                                                        : 'recommend.source'
                                                )}
                                            </a>
                                        )}
                                    </div>
                                )}
                                <button
                                    className={`${btn} text-xs`}
                                    onClick={() => {
                                        setChosen((prev) => ({ ...prev, [hex]: '' }));
                                        setOpen(null);
                                        setSaved(false);
                                        setSelectedClosest(false);
                                    }}
                                >
                                    {t('recommend.remove')}
                                </button>
                            </PopoverContent>
                        </Popover>
                    );
                })}
            </div>
            {!targets.length && <p className="text-sm">{t('recommend.noImage')}</p>}
            <div className="flex gap-2 items-center">
                <button
                    className={btn}
                    disabled={!rows.some((row) => row.matches.length)}
                    onClick={() => {
                        setChosen(
                            Object.fromEntries(
                                rows
                                    .filter((row) => row.matches.length)
                                    .map((row) => [row.hex, row.matches[0].id])
                            )
                        );
                        setSaved(false);
                        setSelectedClosest(true);
                    }}
                >
                    {t('recommend.selectTop')}
                </button>
                <button
                    className={btn}
                    onClick={() => {
                        resetChoices();
                        setOpen(null);
                    }}
                >
                    {t('recommend.clear')}
                </button>
                <span className="text-sm">
                    {picks.filter(Boolean).length}/{targets.length}
                </span>
            </div>
            {selectedClosest && (
                <p role="status" className="text-sm">
                    {t('recommend.closestSelected')}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                {t('recommend.reference')} {t('recommend.notPrediction')} {t('recommend.metric')}
            </p>
            {!!rows.length && rows.some((row) => !row.matches.length) && (
                <p className="text-sm">{t('recommend.noMatches')}</p>
            )}
            <button
                className={btn}
                disabled={!picks.length || picks.some((p) => !p)}
                onClick={() => {
                    const unique = [
                        ...new Map(picks.filter((p) => !!p).map((p) => [p.hex, p])).values(),
                    ];
                    const success = onSave(
                        t('recommend.paletteName'),
                        unique.map((p) => p.hex),
                        undefined,
                        unique.map((p) => `${p.brand} ${p.line} ${p.name}`)
                    );
                    setSaved(success !== false);
                }}
            >
                {t('recommend.save')}
            </button>
            <button
                className={btn}
                disabled={applying || !picks.some(Boolean)}
                onClick={async () => {
                    setApplying(true);
                    try {
                        await onApply();
                    } finally {
                        setApplying(false);
                    }
                }}
            >
                {t('recommend.applyImage')}
            </button>
            <p className="text-xs text-muted-foreground">
                {t('recommend.livePreview')} {t('recommend.applyBeforeExport')}
            </p>
            {saved && (
                <p role="status" className="text-sm">
                    {t('recommend.saved')}
                </p>
            )}
        </section>
    );
}
