
import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const OPEN_HOUR = 16; // 4:00 PM

    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getCycle = useCallback(() => {
        const now = new Date();
        const [drawHours, drawMinutes] = drawTime.split(':').map(Number);
        
        let openTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), OPEN_HOUR, 0, 0);
        let closeTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), drawHours, drawMinutes, 0, 0);

        if (drawHours < OPEN_HOUR) {
            // Draw time is "before" open time (e.g., 14:10 vs 16:00, or 00:55 vs 16:00)
            // This means the cycle's open time was *yesterday* relative to its close time.
             openTime.setDate(openTime.getDate() - 1);
        }

        // If 'now' is already past the end of this cycle, calculate the next cycle.
        if (now >= closeTime) {
            openTime.setDate(openTime.getDate() + 1);
            closeTime.setDate(closeTime.getDate() + 1);
        }
        
        return { openTime, closeTime };
    }, [drawTime]);

    useEffect(() => {
        const formatTime12h = (date: Date) => {
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours || 12;
            const minutesStr = String(minutes).padStart(2, '0');
            return `${String(hours).padStart(2, '0')}:${minutesStr} ${ampm}`;
        };

        // Set initial state
        const initialCycle = getCycle();
        const now = new Date();
        if (now < initialCycle.openTime) setDisplay({ status: 'SOON', text: formatTime12h(initialCycle.openTime) });
        else if (now >= initialCycle.openTime && now < initialCycle.closeTime) setDisplay({ status: 'OPEN', text: '...' });
        else setDisplay({ status: 'CLOSED', text: 'CLOSED' });


        const timer = setInterval(() => {
            const now = new Date();
            const { openTime, closeTime } = getCycle();
            
            let newDisplay;

            if (now < openTime) {
                // Not yet open
                newDisplay = {
                    status: 'SOON',
                    text: formatTime12h(openTime)
                };
            } else if (now >= openTime && now < closeTime) {
                // Open
                const distance = closeTime.getTime() - now.getTime();
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                newDisplay = {
                    status: 'OPEN',
                    text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                };
            } else {
                // This case should be handled by `getCycle` recalculating for the next day,
                // but as a fallback, we show closed. `getCycle` will fix it on the next tick.
                newDisplay = { status: 'CLOSED', text: 'CLOSED' };
            }

            setDisplay(newDisplay);

        }, 1000);

        return () => clearInterval(timer);
    }, [getCycle]);

    return display;
};
