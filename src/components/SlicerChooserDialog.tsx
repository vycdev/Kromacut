import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, FolderOpen } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { listSlicerApps, pickSlicerApp, type SlicerApp } from '../lib/desktopSlicer';
import type { SlicerPreference } from '../lib/slicerPreference';

interface Props {
    preference: SlicerPreference | null;
    missingSlicerName: string | null;
    /** Opened from Settings: confirming saves the selected slicer instead of opening a model. */
    saveOnly?: boolean;
    onConfirm: (slicer: SlicerApp | null, remember: boolean) => void;
    onCancel: () => void;
}

const SYSTEM_DEFAULT = '';

/**
 * Desktop only: asks which slicer opens the model, and whether to stop asking. With `saveOnly`
 * it picks the slicer Open in Slicer uses from now on.
 */
export function SlicerChooserDialog({
    preference,
    missingSlicerName,
    saveOnly = false,
    onConfirm,
    onCancel,
}: Props) {
    const { t } = useTranslation('workspace');
    const groupName = useId();
    const rememberId = useId();
    const savedApp = preference?.kind === 'app' ? preference.app : null;
    const [apps, setApps] = useState<SlicerApp[] | null>(null);
    const [browsed, setBrowsed] = useState<SlicerApp[]>(savedApp ? [savedApp] : []);
    const [selectedPath, setSelectedPath] = useState(savedApp?.path ?? SYSTEM_DEFAULT);
    const [remember, setRemember] = useState(preference !== null);
    const [browsing, setBrowsing] = useState(false);
    const [browseFailed, setBrowseFailed] = useState(false);
    // The chooser has no trigger, so closing it would leave focus on the page body.
    const openerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        listSlicerApps()
            .catch((err) => {
                console.warn('Looking for installed slicers failed', err);
                return [];
            })
            .then((detected) => {
                if (!cancelled) setApps(detected);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Detected slicers first, then saved or browsed ones that are not among them.
    const options = [
        ...(apps ?? []),
        ...browsed.filter((app) => !apps?.some((detected) => detected.path === app.path)),
    ];
    const selected = options.find((app) => app.path === selectedPath) ?? null;

    const browse = async () => {
        setBrowsing(true);
        setBrowseFailed(false);
        try {
            const app = await pickSlicerApp(
                t('slicerChooser.browseTitle'),
                t('slicerChooser.browseFilter'),
                savedApp?.path
            );
            if (!app) return;
            setBrowsed((current) =>
                current.some((known) => known.path === app.path) ? current : [...current, app]
            );
            setSelectedPath(app.path);
        } catch (err) {
            console.warn('Choosing a slicer failed', err);
            setBrowseFailed(true);
        } finally {
            setBrowsing(false);
        }
    };

    const option = (value: string, label: string, detail: string, testId: string) => {
        const checked = selectedPath === value;
        return (
            <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 transition-colors focus-within:ring-1 focus-within:ring-ring ${
                    checked ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                }`}
            >
                <input
                    type="radio"
                    name={groupName}
                    value={value}
                    checked={checked}
                    onChange={() => setSelectedPath(value)}
                    className="sr-only"
                    data-testid={testId}
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground" title={detail}>
                        {detail}
                    </span>
                </span>
                {checked && <Check className="h-4 w-4 shrink-0" aria-hidden />}
            </label>
        );
    };

    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) onCancel();
            }}
        >
            <AlertDialogContent
                data-testid="slicer-chooser"
                onOpenAutoFocus={() => {
                    openerRef.current = document.activeElement as HTMLElement | null;
                }}
                onCloseAutoFocus={(event) => {
                    const opener = openerRef.current;
                    if (!opener?.isConnected || opener === document.body) return;
                    event.preventDefault();
                    opener.focus();
                }}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('slicerChooser.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {missingSlicerName
                            ? t('slicerChooser.missing', { name: missingSlicerName })
                            : saveOnly
                              ? t('slicerChooser.saveDescription')
                              : t('slicerChooser.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex min-w-0 flex-col gap-3">
                    <div
                        role="radiogroup"
                        aria-label={t('slicerChooser.title')}
                        className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1"
                    >
                        {option(
                            SYSTEM_DEFAULT,
                            t('slicerChooser.systemDefault'),
                            t('slicerChooser.systemDefaultHint'),
                            'slicer-option-system'
                        )}
                        {options.map((app) =>
                            option(app.path, app.name, app.path, 'slicer-option')
                        )}
                    </div>
                    {apps === null ? (
                        <p className="text-xs text-muted-foreground">
                            {t('slicerChooser.searching')}
                        </p>
                    ) : (
                        apps.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                                {t('slicerChooser.noneFound')}
                            </p>
                        )
                    )}
                    <Button
                        variant="outline"
                        onClick={browse}
                        disabled={browsing}
                        data-testid="slicer-browse"
                        className="self-start gap-2"
                    >
                        <FolderOpen className="h-4 w-4" />
                        {t('slicerChooser.browse')}
                    </Button>
                    {browseFailed && (
                        <p role="alert" className="text-xs text-destructive">
                            {t('slicerChooser.notAnApp')}
                        </p>
                    )}
                    {!saveOnly && (
                        <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
                            <label htmlFor={rememberId} className="min-w-0 cursor-pointer">
                                <span className="block text-sm font-medium text-foreground">
                                    {t('slicerChooser.remember')}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                    {t('slicerChooser.rememberHint')}
                                </span>
                            </label>
                            <Switch
                                id={rememberId}
                                checked={remember}
                                onCheckedChange={setRemember}
                                data-testid="slicer-remember"
                            />
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>
                        {t('slicerChooser.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        data-testid={saveOnly ? 'slicer-save' : 'slicer-open'}
                        disabled={browsing || (selectedPath !== SYSTEM_DEFAULT && !selected)}
                        onClick={(event) => {
                            event.preventDefault();
                            onConfirm(selected, saveOnly || remember);
                        }}
                    >
                        {saveOnly ? t('slicerChooser.save') : t('slicerChooser.open')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
