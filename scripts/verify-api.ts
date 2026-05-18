import fetch from 'node-fetch';

async function check() {
    console.log('Checking http://localhost:3000/api/games ...');
    try {
        const res = await fetch('http://localhost:3000/api/games');
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body start:', text.substring(0, 100));
        try {
            JSON.parse(text);
            console.log('Result: VALID JSON');
        } catch (e) {
            console.log('Result: INVALID JSON');
        }
    } catch (e: any) {
        console.log('Error:', e.message);
    }
}
check();
