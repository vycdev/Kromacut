import React from 'react';
import { Button } from '@/components/ui/button';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    Download,
    Image,
    Github,
    Heart,
    Loader2,
    Moon,
    Sun,
    MessageCircle,
    RefreshCw,
    Settings,
    X,
    Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
    checkForDesktopUpdates,
    isDesktopUpdateSupported,
    openDesktopReleasesPage,
    type VersionInfo,
} from '@/lib/desktopUpdates';
import {
    applyResolvedTheme,
    applyThemeMode,
    getStoredThemeMode,
    saveThemeMode,
    subscribeToSystemTheme,
    THEME_STORAGE_KEY,
    type ThemeMode,
} from '@/lib/theme';
import {
    getUpdateCheckOnStartup,
    saveUpdateCheckOnStartup,
    subscribeToUpdateCheckOnStartup,
} from '@/lib/updatePreferences';
import logo from '../assets/logo.png';

interface Props {
    onLoadTest: () => void;
    docsOpen: boolean;
    onBackToApp: () => void;
    onToggleDocs: () => void;
}

const appVersion = __APP_VERSION__;
type UpdateCheckStatus = 'idle' | 'checking' | 'available' | 'current' | 'error';

export const Header: React.FC<Props> = ({ onLoadTest, docsOpen, onBackToApp, onToggleDocs }) => {
    const [themeMode, setThemeMode] = React.useState<ThemeMode>(() => getStoredThemeMode());
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [checkOnStartup, setCheckOnStartup] = React.useState(() => getUpdateCheckOnStartup());
    const [updateStatus, setUpdateStatus] = React.useState<UpdateCheckStatus>('idle');
    const [availableUpdate, setAvailableUpdate] = React.useState<VersionInfo | null>(null);
    const [updateError, setUpdateError] = React.useState('');
    const settingsTitleId = React.useId();
    const updateStartupSwitchId = React.useId();
    const isDesktopApp = isDesktopUpdateSupported();

    React.useEffect(() => {
        if (!settingsOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSettingsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [settingsOpen]);

    React.useEffect(() => {
        applyThemeMode(themeMode);

        if (themeMode !== 'system') {
            return;
        }

        return subscribeToSystemTheme((resolvedTheme) => {
            applyResolvedTheme(resolvedTheme);
        });
    }, [themeMode]);

    React.useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === THEME_STORAGE_KEY) {
                setThemeMode(getStoredThemeMode());
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    React.useEffect(() => {
        if (!isDesktopUpdateSupported()) return;

        return subscribeToUpdateCheckOnStartup(setCheckOnStartup);
    }, []);

    React.useEffect(() => {
        if (settingsOpen) return;

        setUpdateStatus('idle');
        setAvailableUpdate(null);
        setUpdateError('');
    }, [settingsOpen]);

    const setTheme = (nextThemeMode: ThemeMode) => {
        saveThemeMode(nextThemeMode);
        setThemeMode(nextThemeMode);
    };

    const setStartupUpdateChecks = (enabled: boolean) => {
        saveUpdateCheckOnStartup(enabled);
        setCheckOnStartup(enabled);
    };

    const handleCheckForUpdates = async () => {
        setUpdateStatus('checking');
        setAvailableUpdate(null);
        setUpdateError('');

        try {
            const updateInfo = await checkForDesktopUpdates();
            setAvailableUpdate(updateInfo);
            setUpdateStatus(updateInfo ? 'available' : 'current');
        } catch (error) {
            console.error('Failed to check for updates:', error);
            setUpdateError('Could not check for updates. Try again later.');
            setUpdateStatus('error');
        }
    };

    const handleDownloadUpdate = async () => {
        try {
            await openDesktopReleasesPage();
        } catch (error) {
            console.error('Failed to open releases page:', error);
            setUpdateError('Could not open the download page.');
            setUpdateStatus('error');
        }
    };

    return (
        <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
            <div className="flex items-center gap-2">
                {docsOpen ? (
                    <button
                        type="button"
                        onClick={onBackToApp}
                        className="-ml-1 flex cursor-pointer items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label="Back to app"
                        title="Back to app"
                    >
                        <img src={logo} alt="" className="h-7 w-auto" />
                        <span className="font-extrabold text-base text-foreground tracking-wide ml-1 select-none max-md:hidden">
                            Kromacut
                        </span>
                    </button>
                ) : (
                    <>
                        <img src={logo} alt="Kromacut" className="h-7 w-auto" />
                        <span className="font-extrabold text-base text-foreground tracking-wide ml-1 select-none max-md:hidden">
                            Kromacut
                        </span>
                    </>
                )}
            </div>
            <div className="flex gap-2.5 items-center">
                <Button
                    size="sm"
                    onClick={onToggleDocs}
                    title={docsOpen ? 'Back to app' : 'Open docs'}
                    className="bg-foreground hover:bg-foreground/90 text-background font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5 border border-foreground/20"
                >
                    {docsOpen ? (
                        <ArrowLeft className="w-4 h-4" />
                    ) : (
                        <BookOpen className="w-4 h-4" />
                    )}
                    <span className="max-sm:hidden">{docsOpen ? 'Back to app' : 'Docs'}</span>
                </Button>
                <Button
                    size="sm"
                    onClick={onLoadTest}
                    title="Load TD Test"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
                >
                    <Image className="w-4 h-4" />
                    <span className="max-sm:hidden">Load TD Test</span>
                </Button>
                <Button
                    size="sm"
                    asChild
                    className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
                >
                    <a
                        href="https://discord.gg/nU63sFMcnX"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Discord"
                        title="Discord"
                    >
                        <MessageCircle className="w-4 h-4" />
                        <span className="max-sm:hidden">Discord</span>
                    </a>
                </Button>
                <Button
                    size="sm"
                    asChild
                    className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
                >
                    <a
                        href="https://github.com/vycdev/Kromacut"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                        title="GitHub"
                    >
                        <Github className="w-4 h-4" />
                        <span className="max-sm:hidden">GitHub</span>
                    </a>
                </Button>
                <Button
                    size="sm"
                    className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
                    asChild
                >
                    <a
                        href="https://www.patreon.com/cw/vycdev"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Support me"
                        title="Support me"
                    >
                        <Heart className="w-4 h-4 fill-current" />
                        <span className="max-sm:hidden">Support me</span>
                    </a>
                </Button>
                <Button
                    size="icon"
                    onClick={() => setSettingsOpen(true)}
                    title="Open settings"
                    aria-label="Open settings"
                    className="h-8 w-8 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 shadow-black/20 dark:shadow-white/30 dark:border dark:border-white/20"
                >
                    <Settings className="w-4 h-4" />
                </Button>
            </div>
            {settingsOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
                    onClick={() => setSettingsOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={settingsTitleId}
                        className="max-h-[min(90vh,42rem)] w-[min(92vw,36rem)] overflow-y-auto rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <h2 id={settingsTitleId} className="text-lg font-semibold text-foreground">
                                Settings
                            </h2>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => setSettingsOpen(false)}
                                aria-label="Close settings"
                                title="Close settings"
                                className="h-8 w-8"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <section className="space-y-3">
                            <div className="text-sm font-medium text-foreground">Theme</div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                <button
                                    type="button"
                                    onClick={() => setTheme('system')}
                                    aria-pressed={themeMode === 'system'}
                                    className={cn(
                                        'flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        themeMode === 'system'
                                            ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                            : 'border-border bg-background hover:bg-muted'
                                    )}
                                >
                                    <Monitor className="w-4 h-4" />
                                    System
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTheme('dark')}
                                    aria-pressed={themeMode === 'dark'}
                                    className={cn(
                                        'flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        themeMode === 'dark'
                                            ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                            : 'border-border bg-background hover:bg-muted'
                                    )}
                                >
                                    <Moon className="w-4 h-4" />
                                    Dark
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTheme('light')}
                                    aria-pressed={themeMode === 'light'}
                                    className={cn(
                                        'flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        themeMode === 'light'
                                            ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                            : 'border-border bg-background hover:bg-muted'
                                    )}
                                >
                                    <Sun className="w-4 h-4" />
                                    Light
                                </button>
                            </div>
                        </section>

                        {isDesktopApp && (
                            <section className="mt-5 space-y-3 border-t border-border pt-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-foreground">
                                        Updates
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCheckForUpdates}
                                        disabled={updateStatus === 'checking'}
                                        title="Check for updates"
                                    >
                                        {updateStatus === 'checking' ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4" />
                                        )}
                                        {updateStatus === 'checking' ? 'Checking' : 'Check'}
                                    </Button>
                                </div>

                                <div className="rounded-md border border-border bg-background p-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <label
                                            htmlFor={updateStartupSwitchId}
                                            className="min-w-0 cursor-pointer"
                                        >
                                            <div className="text-sm font-medium text-foreground">
                                                Check on startup
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                Shows desktop update notices when Kromacut opens.
                                            </div>
                                        </label>
                                        <Switch
                                            id={updateStartupSwitchId}
                                            checked={checkOnStartup}
                                            onCheckedChange={setStartupUpdateChecks}
                                            aria-label="Check for updates on startup"
                                        />
                                    </div>
                                </div>

                                <div aria-live="polite" className="space-y-2">
                                    {updateStatus === 'available' && availableUpdate && (
                                        <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
                                            <div className="flex items-start gap-3">
                                                <Download className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium text-foreground">
                                                        Version {availableUpdate.version} is available
                                                    </div>
                                                    {availableUpdate.release_notes && (
                                                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                            {availableUpdate.release_notes}
                                                        </div>
                                                    )}
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={handleDownloadUpdate}
                                                    className="h-8 flex-shrink-0"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Download
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {updateStatus === 'current' && (
                                        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground">
                                            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                                            Kromacut is up to date.
                                        </div>
                                    )}

                                    {updateStatus === 'error' && (
                                        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                                            <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                                            {updateError}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                            <span>Kromacut</span>
                            <span className="font-mono">v{appVersion}</span>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
