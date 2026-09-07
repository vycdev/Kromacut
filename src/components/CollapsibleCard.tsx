import React, { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { isGroupCollapsed, setGroupCollapsed } from '@/lib/collapsedGroups';

interface CollapsibleCardProps {
    /** Stable identifier used to persist the collapsed state across sessions. */
    id: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Preserve the heading hierarchy of the panel being wrapped. */
    headingLevel?: 3 | 4;
    /**
     * Right side of the header. Always visible, so status badges, counts,
     * warnings, and quick actions stay discoverable while collapsed.
     */
    actions?: React.ReactNode;
    /** Extra indicators rendered in the header only while the card is collapsed. */
    collapsedSummary?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

/** Small amber dot for "this group has non-default/dirty settings" while collapsed. */
export const DirtyDot: React.FC<{ title: string }> = ({ title }) => (
    <span
        role="status"
        aria-label={title}
        title={title}
        className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
    />
);

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
    id,
    title,
    subtitle,
    headingLevel = 3,
    actions,
    collapsedSummary,
    className,
    children,
}) => {
    const [open, setOpen] = useState(() => !isGroupCollapsed(id));
    const Heading = headingLevel === 4 ? 'h4' : 'h3';

    const handleOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next);
            setGroupCollapsed(id, !next);
        },
        [id]
    );

    return (
        <Card className={cn('p-4 border border-border/50', className)}>
            <Collapsible open={open} onOpenChange={handleOpenChange}>
                <div className="flex items-start justify-between gap-2">
                    <Heading className="flex-1 min-w-0">
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="group flex w-full items-start gap-1.5 text-left select-none cursor-pointer min-w-0"
                            >
                                <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                <span className="space-y-1 min-w-0">
                                    <span className="block text-sm font-semibold text-foreground">
                                        {title}
                                    </span>
                                    {subtitle && (
                                        <span className="block text-xs text-muted-foreground">
                                            {subtitle}
                                        </span>
                                    )}
                                </span>
                            </button>
                        </CollapsibleTrigger>
                    </Heading>
                    {(actions || collapsedSummary) && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {!open && collapsedSummary}
                            {actions}
                        </div>
                    )}
                </div>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                    <div className="h-px bg-border/50 my-4" />
                    {children}
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};

export default CollapsibleCard;
