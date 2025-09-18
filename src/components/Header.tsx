import React from 'react';
import logo from '../assets/logo.png';

interface Props {
    onLoadTest: () => void;
}

export const Header: React.FC<Props> = ({ onLoadTest }) => {
    return (
        <header className="app-header">
            <div className="header-left">
                <img src={logo} alt="Kromacut" className="header-logo" />
                <span className="header-title">Kromacut</span>
            </div>
            <div className="header-actions">
                <button
                    type="button"
                    className="header-btn header-btn--test"
                    onClick={onLoadTest}
                    title="Load TD Test"
                >
                    <i className="fa-solid fa-image" aria-hidden />
                    <span>Load TD Test</span>
                </button>
                <a
                    className="header-btn header-btn--github"
                    href="https://github.com/vycdev/Kromacut"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i className="fa-brands fa-github" aria-hidden />
                    <span>GitHub</span>
                </a>
                <a
                    className="header-btn header-btn--patreon"
                    href="https://www.patreon.com/cw/vycdev"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i className="fa-brands fa-patreon" aria-hidden />
                    <span>Support me</span>
                </a>
            </div>
        </header>
    );
};

export default Header;
