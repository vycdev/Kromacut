import notice from '@/data/privacyNotice.json' with { type: 'json' };
import LegalPage from './LegalPage';

export default function PrivacyPage() {
    return <LegalPage kind="privacy" notice={notice} />;
}
