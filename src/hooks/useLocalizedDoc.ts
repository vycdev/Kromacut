import { useEffect, useState } from 'react';
import { loadTranslatedDoc } from '@/docs';
import type { AppLanguage } from '@/lib/languagePreferences';
import type { DocRecord } from '@/types/docs';

export function useLocalizedDoc(canonical: DocRecord | undefined, language: AppLanguage) {
    const [result, setResult] = useState<{ key: string; doc?: DocRecord; failed?: boolean }>();
    const [attempt, setAttempt] = useState(0);
    const slug = canonical?.meta.slug;
    const key = `${language}/${slug}`;
    useEffect(() => {
        if (!slug || language === 'en') return;
        let cancelled = false;
        void loadTranslatedDoc(language, slug)
            .then((doc) => {
                if (!cancelled) setResult({ key, doc });
            })
            .catch(() => {
                if (!cancelled) setResult({ key, failed: true });
            });
        return () => {
            cancelled = true;
        };
    }, [language, slug, key, attempt]);
    return {
        doc: language === 'en' ? canonical : result?.key === key ? result.doc : undefined,
        failed: language !== 'en' && result?.key === key && result.failed,
        retry: () => {
            setResult(undefined);
            setAttempt((value) => value + 1);
        },
    };
}
