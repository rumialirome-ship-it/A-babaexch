async function test() {
    try {
        const res = await fetch('http://localhost:3001/api/games');
        const data = await res.json();
        console.error('Local API Test Result (3001):', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Local API Test Error (3001):', e);
    }
}
test();
