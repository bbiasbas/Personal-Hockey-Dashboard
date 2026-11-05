// One-time Yahoo sign-in: npm run yahoo:auth
import { createInterface } from 'node:readline/promises';
import { authUrl, requestToken } from './oauth.ts';

console.log('1. Open this link, sign in to Yahoo and click Agree:\n');
console.log(`   ${authUrl()}\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('2. Paste the code Yahoo shows you (or the full address you were sent to): ')).trim();
rl.close();

// With an https redirect URI the code arrives as ?code=... in the address bar.
const code = answer.includes('code=') ? new URL(answer).searchParams.get('code') ?? '' : answer;
await requestToken({ grant_type: 'authorization_code', code });
console.log('\nConnected. Your token is saved in .yahoo-token.json (git-ignored). You won\'t need to do this again.');
