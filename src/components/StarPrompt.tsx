/**
 * One-time GitHub star prompt.
 *
 * App shows it once, after the first model export that reaches its destination. The claim is
 * stored before it appears, so dismissing it, starring, or reloading never brings it back.
 */

import type React from 'react';
import { useTranslation } from 'react-i18next';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { REPOSITORY_URL } from '@/lib/starPrompt';

export function StarPrompt({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation('common');

    const handleStar = (event: React.MouseEvent<HTMLAnchorElement>) => {
        // The desktop WebView cannot open new tabs, so the native shell opens the browser.
        if (isTauri()) {
            event.preventDefault();
            invoke('open_repository_page').catch((error: unknown) => {
                console.error('Failed to open the GitHub repository:', error);
            });
        }
        onClose();
    };

    return (
        <section
            aria-labelledby="star-prompt-title"
            data-testid="star-prompt"
            className="pointer-events-auto animate-in slide-in-from-bottom-5"
        >
            <Card className="max-w-sm overflow-hidden border-primary/60 bg-card p-4 shadow-2xl shadow-black/30">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center">
                            <Star className="w-5 h-5 text-amber-400" aria-hidden="true" />
                        </div>
                    </div>
                    <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <h4
                                id="star-prompt-title"
                                className="font-semibold text-sm text-foreground"
                            >
                                {t('starPrompt.title')}
                            </h4>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                aria-label={t('starPrompt.dismiss')}
                                className="h-5 w-5 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('starPrompt.description')}
                        </p>
                        <div className="flex gap-2 pt-1">
                            <Button asChild size="sm" className="h-7 text-xs">
                                <a
                                    href={REPOSITORY_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={handleStar}
                                >
                                    <Star className="h-3 w-3" aria-hidden="true" />
                                    {t('starPrompt.star')}
                                </a>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onClose}
                                className="h-7 text-xs"
                            >
                                {t('starPrompt.later')}
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </section>
    );
}
