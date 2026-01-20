
import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getCycle = useCallback(() => {
        const now = new Date();
        // PKT is UTC+5. Simulate PKT for consistent logic.
        const pktTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const [drawHours, drawMinutes] = drawTime.split(':').map(Number);
        
        // 1. Calculate START (the most recent 4:00 PM PKT)
        const openTime = new Date(pktTime);
        openTime.setUTCHours(16, 0, 0, 0);
        if (pktTime.getUTCHours() < 16) {
            openTime.setUTCDate(openTime.getUTCDate() - 1);
        }

        // 2. Calculate END (the draw time)
        const closeTime = new Date(openTime);
        closeTime.setUTCHours(drawHours, drawMinutes, 0, 0);
        if (drawHours < 16) {
            closeTime.setUTCDate(closeTime.getUTCDate() + 1);
        }

        // 3. Convert back to browser local time for subtraction
        const browserNow = now.getTime();
        const localEndTime = browserNow + (closeTime.getTime() - pktTime.getTime());
        const localStartTime = browserNow - (pktTime.getTime() - openTime.getTime());

        return { 
            openTime: new Date(localStartTime), 
            closeTime: new Date(localEndTime),
            isCurrentlyOpen: pktTime >= openTime && pktTime < closeTime
        };
    }, [drawTime]);

    useEffect(() => {
        const formatTime12h = (date: Date) => {
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
        };

        const update = () => {
            const now = new Date();
            const { openTime, closeTime, isCurrentlyOpen } = getCycle();
            
            if (isCurrentlyOpen) {
                const distance = closeTime.getTime() - now.getTime();
                if (distance <= 0) {
                    setDisplay({ status: 'CLOSED', text: 'CLOSED' });
                } else {
                    const h = Math.floor(distance / (1000 * 60 * 60));
                    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((distance % (1000 * 60)) / 1000);
                    setDisplay({
                        status: 'OPEN',
                        text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    });
                }
            } else {
                if (now < openTime) {
                    setDisplay({ status: 'SOON', text: formatTime12h(openTime) });
                } else {
                    const nextOpen = new Date(openTime);
                    nextOpen.setDate(nextOpen.getDate() + 1);
                    setDisplay({ status: 'SOON', text: formatTime12h(nextOpen) });
                }
            }
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [getCycle]);

    return display;
};
