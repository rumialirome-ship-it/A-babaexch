import * as database from '../server/database';

database.connect();
try {
    const games = database.getAllFromTable('games');
    console.log('API Games Count:', games.length);
    games.forEach(g => console.log(`- ${g.name} (Open: ${g.isMarketOpen})`));

    const loginId = 'Guru';
    const loginResult = database.findAccountForLogin(loginId);
    console.log('Login Result for Guru:', loginResult.account ? 'Found' : 'Not Found');
    if (loginResult.account) {
        console.log('Role:', loginResult.role);
        console.log('Password Match:', loginResult.account.password === 'guru');
    }
} catch (e) {
    console.error('API Test Failed:', e);
}
