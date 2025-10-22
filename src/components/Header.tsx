import React from 'react';
import { Button } from '@/components/ui/button';
import { Image, Github, Heart } from 'lucide-react';
import logo from '../assets/logo.png';

interface Props {
    onLoadTest: () => void;
}

export const Header: React.FC<Props> = ({ onLoadTest }) => {
    return (
        <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
            <div className="flex items-center gap-2">
                <img src={logo} alt="Kromacut" className="h-7 w-auto" />
                <span className="font-extrabold text-base text-foreground tracking-wide ml-1 select-none max-md:hidden">
                    Kromacut
                </span>
            </div>
            <div className="flex gap-2 items-center">
                <Button
                    size="sm"
                    onClick={onLoadTest}
                    title="Load TD Test"
                    className="bg-primary hover:bg-primary/80 text-primary-foreground font-semibold"
                >
                    <Image className="w-4 h-4" />
                    <span>Load TD Test</span>
                </Button>
                <Button
                    size="sm"
                    asChild
                    className="bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-colors shadow-sm hover:shadow-md"
                >
                    <a
                        href="https://github.com/vycdev/Kromacut"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Github className="w-4 h-4" />
                        <span>GitHub</span>
                    </a>
                </Button>
                <Button
                    size="sm"
                    className="bg-gradient-to-r from-destructive to-orange-500 hover:from-destructive/80 hover:to-orange-600 text-destructive-foreground font-semibold"
                    asChild
                >
                    <a
                        href="https://www.patreon.com/cw/vycdev"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Heart className="w-4 h-4 fill-current" />
                        <span>Support me</span>
                    </a>
                </Button>
            </div>
        </header>
    );
};

export default Header;
