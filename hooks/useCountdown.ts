
import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const OPEN_HOUR = 16; // 4:00 PM

    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getCycle = useCallback(() => {
        const now = new Date();
        
        // Safety check for invalid drawTime
        if (!drawTime || typeof drawTime !== 'string' || !drawTime.includes(':')) {
            return { openTime: now, closeTime: now };
        }

        const [drawHours, drawMinutes] = drawTime.split(':').map(Number);
        
        let openTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), OPEN_HOUR, 0, 0);
        let closeTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), drawHours, drawMinutes, 0, 0);

        if (drawHours < OPEN_HOUR) {
             openTime.setDate(openTime.getDate() - 1);
        }

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

        const initialCycle = getCycle();
        const now = new Date();
        
        if (drawTime === 'LOADING' || !drawTime) {
            setDisplay({ status: 'LOADING', text: '...' });
            return;
        }

        if (now < initialCycle.openTime) setDisplay({ status: 'SOON', text: formatTime12h(initialCycle.openTime) });
        else if (now >= initialCycle.openTime && now < initialCycle.closeTime) setDisplay({ status: 'OPEN', text: '...' });
        else setDisplay({ status: 'CLOSED', text: 'CLOSED' });


        const timer = setInterval(() => {
            const now = new Date();
            const { openTime, closeTime } = getCycle();
            
            let newDisplay;

            if (now < openTime) {
                newDisplay = {
                    status: 'SOON',
                    text: formatTime12h(openTime)
                };
            } else if (now >= openTime && now < closeTime) {
                const distance = closeTime.getTime() - now.getTime();
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                newDisplay = {
                    status: 'OPEN',
                    text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                };
            } else {
                newDisplay = { status: 'CLOSED', text: 'CLOSED' };
            }

            setDisplay(newDisplay);

        }, 1000);

        return () => clearInterval(timer);
    }, [getCycle, drawTime]);

    return display;
};
