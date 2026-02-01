#!/usr/bin/env tsx

import qrcode from 'qrcode-terminal';
import { createInvite } from './db.js';
import os from 'os';

const PUBLIC_URL = process.env.PUBLIC_URL;
const PUBLIC_PORT = process.env.PUBLIC_PORT || 3101;
const INVITE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function formatExpiry(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

async function main() {
  const invite = createInvite(INVITE_EXPIRY_MS);
  
  // Determine the base URL
  let baseUrl: string;
  if (PUBLIC_URL) {
    baseUrl = PUBLIC_URL;
  } else {
    const ip = getLocalIP();
    baseUrl = `http://${ip}:${PUBLIC_PORT}`;
  }
  
  const inviteUrl = `${baseUrl}/invite?token=${invite.token}`;
  
  console.log('\n🔑 Scan to join ClawChat:\n');
  
  qrcode.generate(inviteUrl, { small: true }, (qr) => {
    console.log(qr);
    console.log(`\nOr visit: ${inviteUrl}`);
    console.log(`Expires in ${formatExpiry(INVITE_EXPIRY_MS)}.\n`);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
