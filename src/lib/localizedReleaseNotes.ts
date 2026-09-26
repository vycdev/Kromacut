import { matchLanguage, type AppLanguage } from './languagePreferences.ts';

export interface ReleaseNotesFields {
    /** Legacy English text remains readable by already-released desktop clients. */
    release_notes?: string;
    /** The feed supplies translations for this release, never for an older version. */
    release_notes_localized?: Partial<Record<AppLanguage, string>>;
}

export interface LocalizedReleaseNotes {
    text: string;
    language: AppLanguage;
}

/** Resolve at display time so changing language does not refetch update metadata. */
export function localizedReleaseNotes(
    update: ReleaseNotesFields,
    language: string | undefined
): LocalizedReleaseNotes | null {
    const requested = matchLanguage(language) ?? 'en';
    const localized = update.release_notes_localized?.[requested];
    if (typeof localized === 'string' && localized.trim()) {
        return { text: localized, language: requested };
    }
    // Old feeds can only supply English. Keep their information, with an explicit
    // lang attribute at the call site, rather than substituting stale bundled notes.
    const english = [update.release_notes_localized?.en, update.release_notes].find(
        (note): note is string => typeof note === 'string' && Boolean(note.trim())
    );
    return english ? { text: english, language: 'en' } : null;
}
