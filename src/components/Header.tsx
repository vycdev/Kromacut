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
            <div className="flex gap-2.5 items-center">
                <Button
                    size="sm"
                    onClick={onLoadTest}
                    title="Load TD Test"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
                >
                    <Image className="w-4 h-4" />
                    <span>Load TD Test</span>
                </Button>
                <Button
                    size="sm"
                    asChild
                    className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
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
                    className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
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
