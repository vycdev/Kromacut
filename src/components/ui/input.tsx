import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

interface NumberInputProps extends React.ComponentProps<'input'> {
    onValueChange?: (value: number) => void;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
    ({ className, value, onChange, onValueChange, ...props }, ref) => {
        const inputRef = React.useRef<HTMLInputElement>(null);
        React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

        const handleIncrement = () => {
            if (inputRef.current) {
                const current = parseFloat(inputRef.current.value) || 0;
                const step = parseFloat(inputRef.current.step) || 1;
                const newValue = current + step;
                inputRef.current.value = String(newValue);

                // Trigger change event
                const event = new Event('change', { bubbles: true });
                inputRef.current.dispatchEvent(event);
                onChange?.({ target: inputRef.current } as React.ChangeEvent<HTMLInputElement>);
                onValueChange?.(newValue);
            }
        };

        const handleDecrement = () => {
            if (inputRef.current) {
                const current = parseFloat(inputRef.current.value) || 0;
                const step = parseFloat(inputRef.current.step) || 1;
                const newValue = current - step;
                inputRef.current.value = String(newValue);

                // Trigger change event
                const event = new Event('change', { bubbles: true });
                inputRef.current.dispatchEvent(event);
                onChange?.({ target: inputRef.current } as React.ChangeEvent<HTMLInputElement>);
                onValueChange?.(newValue);
            }
        };

        return (
            <div className="relative inline-block w-full">
                <input
                    type="number"
                    className={cn(
                        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                        className
                    )}
                    ref={inputRef}
                    value={value}
                    onChange={onChange}
                    {...props}
                />
                <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 h-5 pointer-events-auto">
                    <button
                        type="button"
                        className="flex items-center justify-center w-6 h-2.5 px-0 border border-border/50 bg-muted hover:bg-muted/80 active:bg-primary text-foreground cursor-pointer text-xs font-bold transition-colors rounded-t-sm disabled:opacity-50 disabled:cursor-not-allowed user-select-none hover:text-foreground"
                        onClick={handleIncrement}
                        tabIndex={-1}
                        aria-label="Increment"
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        className="flex items-center justify-center w-6 h-2.5 px-0 border border-border/50 bg-muted hover:bg-muted/80 active:bg-primary text-foreground cursor-pointer text-xs font-bold transition-colors rounded-b-sm disabled:opacity-50 disabled:cursor-not-allowed user-select-none hover:text-foreground"
                        onClick={handleDecrement}
                        tabIndex={-1}
                        aria-label="Decrement"
                    >
                        ▼
                    </button>
                </div>
            </div>
        );
    }
);
NumberInput.displayName = 'NumberInput';

export { Input, NumberInput };
