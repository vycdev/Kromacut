import { createInstance } from 'i18next';
import common from '../locales/en/common.json' with { type: 'json' };
import workspace from '../locales/en/workspace.json' with { type: 'json' };
import printing from '../locales/en/printing.json' with { type: 'json' };
import calibration from '../locales/en/calibration.json' with { type: 'json' };
import messages from '../locales/en/messages.json' with { type: 'json' };
import publicPages from '../locales/en/public.json' with { type: 'json' };
import docsMeta from '../locales/en/docsMeta.json' with { type: 'json' };
import diagrams from '../locales/en/diagrams.json' with { type: 'json' };
import privacy from '../data/privacyNotice.json' with { type: 'json' };
import terms from '../data/termsNotice.json' with { type: 'json' };

/** React-free, synchronous English defaults also work in Node tests and exports. */
export const I18N_NAMESPACES = [
    'common',
    'workspace',
    'printing',
    'calibration',
    'messages',
    'public',
    'privacy',
    'terms',
    'docsMeta',
    'diagrams',
] as const;
export const i18n = createInstance();
void i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    resources: {
        en: {
            common,
            workspace,
            printing,
            calibration,
            messages,
            public: publicPages,
            privacy,
            terms,
            docsMeta,
            diagrams,
        },
    },
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
});

/** Use in event handlers and non-React helpers, never in persistent model data. */
export const translate = i18n.t.bind(i18n);
