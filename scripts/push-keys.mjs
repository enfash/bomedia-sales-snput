// Prints a new pair of phone-alert (VAPID) keys and a dispatch secret. It writes nothing: copy the values into the server's environment yourself.
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Add these to the server environment (never commit them):\n');
console.log(`PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('PUSH_VAPID_SUBJECT=mailto:owner@your-domain.example   # an address the push services can reach you on');
console.log(`PUSH_DISPATCH_SECRET=${randomBytes(24).toString('hex')}   # only needed if a scheduler will call /api/push/dispatch`);
