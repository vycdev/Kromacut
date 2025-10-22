import React from 'react';
import logo from '../assets/logo.png';

interface Props {
    onLoadTest: () => void;
}

export const Header: React.FC<Props> = ({ onLoadTest }) => {
    return (
        <header className="h-12 flex items-center justify-between px-3 border-b border-white/5 mb-2">
            <div className="flex items-center gap-2">
                <img src={logo} alt="Kromacut" className="h-7 w-auto" />
                <span className="font-extrabold text-base text-white tracking-wide ml-1 select-none max-md:hidden">
                    Kromacut
                </span>
            </div>
            <div className="flex gap-2 items-center">
                <button
                    type="button"
                    className="inline-flex gap-2 items-center px-2.5 py-1.5 rounded-lg bg-white/3 text-white border border-white/5 font-bold hover:bg-white/5 transition-colors"
                    onClick={onLoadTest}
                    title="Load TD Test"
                >
                    <i className="fa-solid fa-image text-sm" aria-hidden />
                    <span>Load TD Test</span>
                </button>
                <a
                    className="inline-flex gap-2 items-center px-2.5 py-1.5 rounded-lg bg-white/3 text-white border border-white/5 font-bold hover:bg-white/5 transition-colors"
                    href="https://github.com/vycdev/Kromacut"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i className="fa-brands fa-github text-sm" aria-hidden />
                    <span>GitHub</span>
                </a>
                <a
                    className="inline-flex gap-2 items-center px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white border border-white/30 font-bold hover:from-red-600 hover:to-orange-600 transition-all"
                    href="https://www.patreon.com/cw/vycdev"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i className="fa-brands fa-patreon text-sm" aria-hidden />
                    <span>Support me</span>
                </a>
            </div>
        </header>
    );
};

export default Header;
