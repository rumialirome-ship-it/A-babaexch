async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/games');
        const data = await res.json();
        console.error('Local API Test Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Local API Test Error:', e);
    }
}
test();
