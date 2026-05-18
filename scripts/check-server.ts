import fetch from 'node-fetch';

async function check() {
    try {
        const res = await fetch('http://localhost:3000/api/games');
        console.log('STATUS:', res.status);
        const data = await res.json();
        console.log('GAMES_COUNT:', Array.isArray(data) ? data.length : 'NOT_AN_ARRAY');
    } catch (e: any) {
        console.log('ERROR:', e.message);
    }
}
check();
