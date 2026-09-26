import notice from '@/data/termsNotice.json' with { type: 'json' };
import LegalPage from './LegalPage';

export default function TermsPage() {
    return <LegalPage kind="terms" notice={notice} />;
}
