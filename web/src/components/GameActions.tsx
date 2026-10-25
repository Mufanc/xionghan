export interface GameAction {
    id: string;
    label: string;
    placement: 'toolbar' | 'menu' | 'hidden';
    group?: string;
    disabled?: boolean;
    pressed?: boolean;
    emphasis?: 'quiet' | 'primary';
    onClick: () => void;
}

interface GameActionsProps {
    actions: GameAction[];
    placement: 'toolbar' | 'menu';
    onBeforeAction?: () => void;
}

export function GameActions({ actions, placement, onBeforeAction }: GameActionsProps) {
    const visible = actions.filter((action) => action.placement === placement);

    if (!visible.length) return null;

    const buttons = visible.map((action) => (
        <button
            key={action.id}
            className={
                placement === 'toolbar' ? `ui-button ${action.emphasis ?? ''}`.trim() : undefined
            }
            disabled={action.disabled}
            aria-pressed={action.pressed}
            onClick={() => {
                onBeforeAction?.();
                action.onClick();
            }}
        >
            {action.pressed !== undefined && <span className="toggle-dot" aria-hidden="true" />}
            {action.label}
        </button>
    ));

    if (placement === 'menu') return <div className="menu-group">{buttons}</div>;

    const groups: (typeof buttons)[] = [];

    visible.forEach((action, index) => {
        if (!index || action.group !== visible[index - 1].group) groups.push([]);
        groups[groups.length - 1].push(buttons[index]);
    });

    return groups.map((group) => (
        <div className="action-group" key={group[0].key}>
            {group}
        </div>
    ));
}
