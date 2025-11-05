import { useState, useEffect, useCallback } from 'react';

export const useCountdown = (drawTime: string) => {
    const OPEN_HOUR_UTC = 11; // 4:00 PM PKT is 11:00 AM UTC
    const PKT_OFFSET_HOURS = 5;

    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getCycle = useCallback(() => {
        const now = new Date(); // local time from browser
        const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
        const drawHoursUTC = (drawHoursPKT - PKT_OFFSET_HOURS + 24) % 24;

        // Determine the timestamp for the most recent 11:00 UTC
        let openTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), OPEN_HOUR_UTC, 0, 0));
        if (now.getTime() < openTime.getTime()) {
            openTime.setUTCDate(openTime.getUTCDate() - 1);
        }
        
        // Calculate the close time relative to this open time's date
        let closeTime = new Date(Date.UTC(openTime.getUTCFullYear(), openTime.getUTCMonth(), openTime.getUTCDate(), drawHoursUTC, drawMinutesPKT, 0));
        
        if (drawHoursUTC < OPEN_HOUR_UTC) {
            closeTime.setUTCDate(closeTime.getUTCDate() + 1);
        }

        if (now.getTime() >= closeTime.getTime()) {
            openTime.setUTCDate(openTime.getUTCDate() + 1);
            
            closeTime = new Date(Date.UTC(openTime.getUTCFullYear(), openTime.getUTCMonth(), openTime.getUTCDate(), drawHoursUTC, drawMinutesPKT, 0));
            if (drawHoursUTC < OPEN_HOUR_UTC) {
                closeTime.setUTCDate(closeTime.getUTCDate() + 1);
            }
        }
        
        return { openTime, closeTime };
    }, [drawTime]);

    useEffect(() => {
        const formatTime12h = (date: Date) => {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };

        const updateDisplay = () => {
            const now = new Date();
            const { openTime, closeTime } = getCycle();
            
            if (now < openTime) {
                setDisplay({ status: 'SOON', text: `at ${formatTime12h(openTime)}` });
            } else if (now >= openTime && now < closeTime) {
                const distance = closeTime.getTime() - now.getTime();
                const hours = Math.floor(distance / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                setDisplay({
                    status: 'OPEN',
                    text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                });
            } else {
                setDisplay({ status: 'CLOSED', text: 'CLOSED' });
            }
        };
        
        updateDisplay(); // Initial call
        const timer = setInterval(updateDisplay, 1000);
        return () => clearInterval(timer);
    }, [drawTime, getCycle]);

    return display;
};
