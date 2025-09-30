import React, { useState, useEffect } from 'react';

interface DiceProps {
    die1: number;
    die2: number;
    isRolling: boolean;
}

const DieDisplay: React.FC<{ value: number }> = ({ value }) => {
    return (
        <div className="w-16 h-16 bg-white border-2 border-gray-400 rounded-lg flex justify-center items-center">
            <span className="text-4xl font-bold text-gray-800">{value}</span>
        </div>
    );
};

export const Dice: React.FC<DiceProps> = ({ die1, die2, isRolling }) => {
    const [displayDie1, setDisplayDie1] = useState(die1 || 1);
    const [displayDie2, setDisplayDie2] = useState(die2 || 1);

    useEffect(() => {
        if (isRolling) {
            const interval = setInterval(() => {
                setDisplayDie1(Math.floor(Math.random() * 6) + 1);
                setDisplayDie2(Math.floor(Math.random() * 6) + 1);
            }, 100);
            return () => clearInterval(interval);
        } else {
            setDisplayDie1(die1 || 1);
            setDisplayDie2(die2 || 1);
        }
    }, [isRolling, die1, die2]);

    return (
        <div className="flex justify-center items-center gap-4 my-4 p-4 bg-gray-200 rounded-lg h-28">
            <DieDisplay value={displayDie1} />
            <DieDisplay value={displayDie2} />
        </div>
    );
};