import React from 'react';
import { Button } from '@/components/ui/button';
import logo from '../assets/logo.png';

interface Props {
    onLoadTest: () => void;
}

export const Header: React.FC<Props> = ({ onLoadTest }) => {
    return (
        <header className="h-12 flex items-center justify-between px-3 border-b border-border mb-2">
            <div className="flex items-center gap-2">
                <img src={logo} alt="Kromacut" className="h-7 w-auto" />
                <span className="font-extrabold text-base text-foreground tracking-wide ml-1 select-none max-md:hidden">
                    Kromacut
                </span>
            </div>
            <div className="flex gap-2 items-center">
                <Button variant="secondary" size="sm" onClick={onLoadTest} title="Load TD Test">
                    <i className="fa-solid fa-image text-sm" aria-hidden />
                    <span>Load TD Test</span>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                    <a
                        href="https://github.com/vycdev/Kromacut"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <i className="fa-brands fa-github text-sm" aria-hidden />
                        <span>GitHub</span>
                    </a>
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                    asChild
                >
                    <a
                        href="https://www.patreon.com/cw/vycdev"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <i className="fa-brands fa-patreon text-sm" aria-hidden />
                        <span>Support me</span>
                    </a>
                </Button>
            </div>
        </header>
    );
};

export default Header;
