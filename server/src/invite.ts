#!/usr/bin/env tsx

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import qrcode from 'qrcode-terminal';
import { createInvite } from './db.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3102';
const INVITE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function formatExpiry(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

async function main() {
  const invite = createInvite(INVITE_EXPIRY_MS);
  const inviteUrl = `${BASE_URL}/invite?token=${invite.token}`;

  console.log('\n🔑 ClawChat Invite\n');

  qrcode.generate(inviteUrl, { small: true }, (qr) => {
    console.log(qr);
    console.log(`\nURL: ${inviteUrl}`);
    console.log(`Expires in ${formatExpiry(INVITE_EXPIRY_MS)}.\n`);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
