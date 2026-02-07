import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
    id: string;
    children: React.ReactNode;
    disabled?: boolean;
}

export const SortableItem: React.FC<Props> = ({ id, children, disabled }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
        minWidth: 0,
        overflow: 'hidden',
        flexShrink: 0,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} tabIndex={-1}>
            {children}
        </div>
    );
};
