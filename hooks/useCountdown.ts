
import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const [display, setDisplay] = useState<{status: 'OPEN' | 'CLOSED', text: string}>({ status: 'OPEN', text: '...' });

    const calculate = useCallback(() => {
        const now = new Date();
        const [hours, minutes] = drawTime.split(':').map(Number);
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);

        // If target is earlier than now, it's for tomorrow
        if (target < now) {
            target.setDate(target.getDate() + 1);
        }

        const diff = target.getTime() - now.getTime();
        
        if (diff <= 0) {
            setDisplay({ status: 'CLOSED', text: 'DRAWING...' });
            return;
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        setDisplay({
            status: 'OPEN',
            text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        });
    }, [drawTime]);

    useEffect(() => {
        calculate();
        const itv = setInterval(calculate, 1000);
        return () => clearInterval(itv);
    }, [calculate]);

    return display;
};
