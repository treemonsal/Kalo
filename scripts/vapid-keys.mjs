// Creates a VAPID key pair for push reminders: node scripts/vapid-keys.mjs
// Store both values as secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) and keep the private key out of the repository.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const base64url = bytes => Buffer.from(bytes).toString("base64url");
console.log("VAPID_PUBLIC_KEY=" + base64url(raw));
console.log("VAPID_PRIVATE_KEY=" + jwk.d);
