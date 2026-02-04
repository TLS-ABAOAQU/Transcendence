import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface Props {
    id: string;
    children: React.ReactNode;
    className?: string;
}

export const Droppable: React.FC<Props> = ({ id, children, className }) => {
    const { setNodeRef } = useDroppable({
        id,
    });

    return (
        <div ref={setNodeRef} className={className}>
            {children}
        </div>
    );
};
