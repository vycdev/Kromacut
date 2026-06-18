/**
 * Update Checker Component
 * 
 * Checks for new app updates when running in Tauri desktop app.
 * Displays a notification when a new version is available.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, X } from 'lucide-react';
import {
    checkForDesktopUpdates,
    isDesktopUpdateSupported,
    openDesktopReleasesPage,
    type VersionInfo,
} from '@/lib/desktopUpdates';
import {
    getUpdateCheckOnStartup,
    subscribeToUpdateCheckOnStartup,
} from '@/lib/updatePreferences';

export function UpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState<VersionInfo | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [checking, setChecking] = useState(false);
    const [checkOnStartup, setCheckOnStartup] = useState(() => getUpdateCheckOnStartup());

    useEffect(() => {
        if (!isDesktopUpdateSupported()) return;

        return subscribeToUpdateCheckOnStartup(setCheckOnStartup);
    }, []);

    useEffect(() => {
        if (!checkOnStartup) {
            setUpdateAvailable(null);
            setChecking(false);
        }
    }, [checkOnStartup]);

    useEffect(() => {
        if (!isDesktopUpdateSupported() || !checkOnStartup) return;

        let active = true;

        const checkForUpdates = async () => {
            setChecking(true);
            try {
                const updateInfo = await checkForDesktopUpdates();

                if (active) {
                    setUpdateAvailable(updateInfo);
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
            } finally {
                if (active) {
                    setChecking(false);
                }
            }
        };

        // Check for updates on mount
        checkForUpdates();

        // Check periodically (every 4 hours)
        const interval = setInterval(checkForUpdates, 4 * 60 * 60 * 1000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [checkOnStartup]);

    if (!isDesktopUpdateSupported() || !checkOnStartup || !updateAvailable || dismissed || checking) {
        return null;
    }

    const handleDownload = async () => {
        try {
            await openDesktopReleasesPage();
        } catch (error) {
            console.error('Failed to open releases page:', error);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
            <Card className="max-w-sm overflow-hidden border-primary/60 bg-card p-4 shadow-2xl shadow-black/30">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <Download className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                            <h4 className="font-semibold text-sm text-foreground">
                                Update Available
                            </h4>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDismissed(true)}
                                className="h-5 w-5 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Version <span className="font-mono font-semibold text-foreground">{updateAvailable.version}</span> is now available!
                        </p>
                        {updateAvailable.release_notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {updateAvailable.release_notes}
                            </p>
                        )}
                        <div className="flex gap-2 pt-1">
                            <Button
                                size="sm"
                                onClick={handleDownload}
                                className="h-7 text-xs bg-primary hover:bg-primary/90"
                            >
                                Download
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDismissed(true)}
                                className="h-7 text-xs"
                            >
                                Later
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
