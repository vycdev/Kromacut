import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import logo from '@/assets/logo.png';
import innovationFundMedal from '../../content/badges/innovation-fund-medal.png';
import { applyAwardsSeo } from '@/lib/seo';
import { applyThemeMode, getStoredThemeMode, subscribeToSystemTheme } from '@/lib/theme';
import LanguageSetting from './LanguageSetting';
import { publicPath } from '@/lib/routes';
import './privacy-page.css';

// Each award shows its approved artwork unaltered and only the wording its organizer allows.
const awards = [
    {
        id: 'snapmaker-innovation-fund',
        image: innovationFundMedal,
        nameKey: 'landing.snapmakerInnovationFundWinner',
        href: 'https://www.snapmaker.com/innovation-fund',
        linkKey: 'landing.aboutTheSnapmakerInnovationFund',
    },
] as const;

export default function AwardsPage() {
    const { t, i18n } = useTranslation('public');

    useEffect(() => {
        applyAwardsSeo();
        const syncTheme = () => applyThemeMode(getStoredThemeMode());
        syncTheme();
        const unsubscribe = subscribeToSystemTheme(() => {
            if (getStoredThemeMode() === 'system') syncTheme();
        });
        window.addEventListener('storage', syncTheme);
        return () => {
            unsubscribe();
            window.removeEventListener('storage', syncTheme);
        };
    }, [i18n.resolvedLanguage]);

    return (
        <main className="privacy-page" data-testid="awards-page" aria-labelledby="awards-heading">
            <div className="privacy-shell">
                <header className="privacy-header">
                    <a
                        className="privacy-brand"
                        href={`${publicPath('/')}?landing=1`}
                        aria-label={t('navigation.homeLabel')}
                    >
                        <img src={logo} width="36" height="36" alt="" />
                        <span>Kromacut</span>
                    </a>
                    <a className="privacy-app-link" href="/app">
                        {t('navigation.openApp')}
                    </a>
                </header>
                <article className="privacy-article">
                    <p className="privacy-eyebrow">{t('awards.eyebrow')}</p>
                    <h1 id="awards-heading">{t('awards.title')}</h1>
                    <p className="privacy-intro">{t('awards.intro')}</p>
                    {awards.map((award) => (
                        <section
                            key={award.id}
                            className="awards-entry"
                            aria-labelledby={`award-${award.id}`}
                        >
                            <img
                                className="awards-medal"
                                src={award.image}
                                width="480"
                                height="480"
                                alt=""
                            />
                            <div>
                                <h2 id={`award-${award.id}`}>{t(award.nameKey)}</h2>
                                <p>
                                    <a href={award.href} target="_blank" rel="noopener noreferrer">
                                        {t(award.linkKey)}
                                    </a>
                                </p>
                            </div>
                        </section>
                    ))}
                </article>
                <footer className="privacy-footer">
                    <a href={`${publicPath('/')}?landing=1`}>{t('navigation.home')}</a>
                    <a href={publicPath('/docs/overview')}>{t('navigation.docs')}</a>
                    <a href={publicPath('/privacy')}>{t('navigation.privacy')}</a>
                    <a href={publicPath('/terms')}>{t('navigation.terms')}</a>
                </footer>
                <LanguageSetting compact />
            </div>
        </main>
    );
}
