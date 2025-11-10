
import { useState, useEffect, useCallback } from 'react';

const OPEN_HOUR_PKT = 16;
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_UTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS; // 11

/**
 * Determines the "market day" for a given bet timestamp, factoring in the daily reset time.
 * All calculations are in UTC to ensure consistency with the backend.
 * @param betTimestamp The Date object of the bet.
 * @returns A string in 'YYYY-MM-DD' format representing the market day in UTC.
 */
export const getMarketDateForBet = (betTimestamp: Date): string => {
    const d = new Date(betTimestamp.getTime());
    // The market day is based on the 11:00 UTC (4 PM PKT) reset time.
    // If a bet is placed before 11:00 UTC on a given day, it belongs to the *previous* day's market cycle.
    if (d.getUTCHours() < RESET_HOUR_UTC) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
};


export const useCountdown = (drawTime: string) => {
    const [display, setDisplay] = useState<{status: 'LOADING' | 'SOON' | 'OPEN' | 'CLOSED', text: string}>({ status: 'LOADING', text: '...' });

    const getClientCycle = useCallback(() => {
        const now = new Date();
        const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
        const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

        let lastOpenTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), openHourUTC, 0, 0));
        if (now.getTime() < lastOpenTime.getTime()) {
            lastOpenTime.setUTCDate(lastOpenTime.getUTCDate() - 1);
        }

        let closeTime = new Date(lastOpenTime.getTime());
        const drawHourUTC = (drawHoursPKT - PKT_OFFSET_HOURS + 24) % 24;

        closeTime.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);

        // If setting the time made it earlier than or equal to the open time, it must be for the next day.
        if (closeTime.getTime() <= lastOpenTime.getTime()) {
            closeTime.setUTCDate(closeTime.getUTCDate() + 1);
        }

        return { openTime: lastOpenTime, closeTime: closeTime };
    }, [drawTime]);

    useEffect(() => {
        const formatTime12h = (date: Date) => {
            // This will format the UTC date into the user's local 12h time, which is correct.
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours || 12;
            const minutesStr = String(minutes).padStart(2, '0');
            return `${String(hours).padStart(2, '0')}:${minutesStr} ${ampm}`;
        };
        
        const updateDisplay = () => {
            const now = new Date();
            const { openTime, closeTime } = getClientCycle();
            
            let newDisplay;

            if (now < openTime) {
                newDisplay = { status: 'SOON', text: formatTime12h(openTime) };
            } else if (now >= openTime && now < closeTime) {
                const distance = closeTime.getTime() - now.getTime();
                const hours = Math.floor(distance / (1000 * 60 * 60));
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
        };
        
        updateDisplay(); // Initial call to set state immediately
        const timer = setInterval(updateDisplay, 1000);

        return () => clearInterval(timer);
    }, [getClientCycle]);

    return display;
};
