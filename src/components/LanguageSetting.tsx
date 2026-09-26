import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { changeAppLanguage } from '../i18n';
import { languageFromPath } from '../lib/routes';
import {
    getLanguagePreference,
    LANGUAGE_STORAGE_KEY,
    SUPPORTED_LANGUAGES,
    resolveLanguage,
    type LanguagePreference,
} from '../lib/languagePreferences';

export default function LanguageSetting({ compact = false }: { compact?: boolean }) {
    const { t } = useTranslation('common');
    const languageId = useId();
    const fromLocation = (): LanguagePreference => {
        const saved = getLanguagePreference();
        const explicit = languageFromPath(window.location.pathname);
        return explicit && explicit !== resolveLanguage(saved) ? explicit : saved;
    };
    const [preference, setPreference] = useState<LanguagePreference>(fromLocation);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
                setPreference(getLanguagePreference());
            }
        };
        const onLocation = () => setPreference(fromLocation());
        window.addEventListener('storage', onStorage);
        window.addEventListener('popstate', onLocation);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('popstate', onLocation);
        };
    }, []);

    const selectLanguage = async (next: LanguagePreference) => {
        if (pending) return;
        setPending(true);
        setFailed(false);
        try {
            await changeAppLanguage(next);
            setPreference(next);
        } catch {
            setFailed(true);
        } finally {
            setPending(false);
        }
    };

    return (
        <section
            className={
                compact
                    ? 'relative min-w-0 max-w-full'
                    : 'mt-5 space-y-3 border-t border-border pt-5'
            }
        >
            <label
                htmlFor={languageId}
                className={compact ? 'sr-only' : 'flex items-center gap-2 text-sm font-medium'}
            >
                <Languages aria-hidden="true" className="h-4 w-4" />
                {t('language.title')}
            </label>
            <Select
                value={preference}
                open={open}
                onOpenChange={(next) => {
                    if (!pending || !next) setOpen(next);
                }}
                onValueChange={(value) => void selectLanguage(value as LanguagePreference)}
            >
                {/* Keep the trigger focusable so closing the menu can restore keyboard focus. */}
                <SelectTrigger
                    id={languageId}
                    data-testid="app-language"
                    aria-disabled={pending}
                    aria-busy={pending}
                    className={
                        compact
                            ? 'inline-flex h-11 min-h-11 w-auto max-w-full gap-2 border-0 px-1 text-sm font-normal text-muted-foreground shadow-none transition-colors hover:text-foreground focus:ring-2 motion-reduce:transition-none aria-disabled:cursor-wait aria-disabled:opacity-50'
                            : 'aria-disabled:cursor-wait aria-disabled:opacity-50'
                    }
                >
                    {compact && <Languages aria-hidden="true" className="h-4 w-4 shrink-0" />}
                    <SelectValue />
                </SelectTrigger>
                <SelectContent
                    align={compact ? 'end' : 'start'}
                    className={
                        compact
                            ? 'z-[110] max-h-72 min-w-56 max-w-[calc(100vw-2.5rem)]'
                            : 'z-[110] max-h-72 w-[var(--radix-select-trigger-width)]'
                    }
                >
                    <SelectItem value="system">{t('language.system')}</SelectItem>
                    {SUPPORTED_LANGUAGES.map(({ code, name }) => (
                        <SelectItem key={code} value={code}>
                            <span lang={code}>{name}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {pending && (
                <p role="status" className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}>
                    {t('language.loading')}
                </p>
            )}
            {failed && (
                <p role="alert" className="text-xs text-destructive">
                    {t('language.failed')}
                </p>
            )}
        </section>
    );
}
