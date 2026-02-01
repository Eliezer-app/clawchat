#!/usr/bin/env tsx

import { createInvite } from './db.js';
import qrcode from 'qrcode-terminal';

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://127.0.0.1:3101';

function main() {
  const invite = createInvite();
  const inviteUrl = `${PUBLIC_URL}/api/auth/invite?token=${invite.token}`;
  
  console.log('\n🔐 ClawChat Invite\n');
  console.log('Scan this QR code to join:\n');
  
  qrcode.generate(inviteUrl, { small: true }, (qr) => {
    console.log(qr);
    console.log(`\nOr visit: ${inviteUrl}`);
    console.log(`\nExpires: ${new Date(invite.expiresAt).toLocaleString()}`);
    console.log('(5 minutes from now)\n');
  });
}

main();
