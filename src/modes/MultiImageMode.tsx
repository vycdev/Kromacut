import React from 'react';

// Placeholder shell for issue #35 multi-image mode. See
// tmp_multi_modularization.plan.txt, Step 0: lands the module's shape early
// and inert; the tile rail, per-tile workspaces, and grid settings UI arrive
// in later steps (4, 2/3, and 5 respectively).
function MultiImageMode(): React.ReactElement {
    return (
        <div className="box-border text-inherit font-sans flex flex-col flex-1 min-w-0 max-w-full min-h-0 h-screen w-full items-center justify-center">
            <p className="text-muted-foreground">Multi-image mode — coming soon.</p>
        </div>
    );
}

export default MultiImageMode;
