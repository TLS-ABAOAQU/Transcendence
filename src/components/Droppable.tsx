import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface Props {
    id: string;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const Droppable: React.FC<Props> = ({ id, children, className, style }) => {
    const { setNodeRef } = useDroppable({
        id,
    });

    return (
        <div ref={setNodeRef} className={className} style={style}>
            {children}
        </div>
    );
};
