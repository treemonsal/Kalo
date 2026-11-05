import { dayOf } from "./learning.ts";
import { streak } from "./progress.ts";
import type { Account, AccountStore } from "./service.ts";
import { dueTotal } from "./social.ts";

/**
 * Web Push without payload. The push only wakes the service worker, which then fetches the text from
 * /api/workspace?notice=1. That avoids payload encryption; the request is signed with VAPID (ES256).
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url, see scripts/vapid-keys.mjs) and a cron trigger.
 */
export type PushKeys = { publicKey: string; privateKey: string; subject: string };
export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSettings = { subs: Subscription[]; morning: string; evening: string; sent: { morning?: string; evening?: string } };

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), c => c.charCodeAt(0));
const encodeText = (text: string) => encode(new TextEncoder().encode(text));

export async function vapidAuthorization(endpoint: string, keys: PushKeys, now: number) {
  const point = decode(keys.publicKey);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: keys.privateKey, x: encode(point.slice(1, 33)), y: encode(point.slice(33, 65)), ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const unsigned = encodeText(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." +
    encodeText(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject }));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)));
  return "vapid t=" + unsigned + "." + encode(signature) + ", k=" + keys.publicKey;
}

/** Sends one wake-up push. Returns false when the subscription is gone and should be removed. */
export async function sendPush(sub: Subscription, keys: PushKeys, now: number, send: typeof fetch = fetch) {
  const response = await send(sub.endpoint, {
    method: "POST", headers: { Authorization: await vapidAuthorization(sub.endpoint, keys, now), TTL: "3600", Urgency: "normal", "Content-Length": "0" },
  });
  return response.status !== 404 && response.status !== 410;
}

const clock = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/** Which reminder is due for this account right now, if any. The cron runs every 15 minutes. */
export function reminderFor(account: Account, now: number, window = 15): "morning" | "evening" | null {
  const push = account.push;
  if (!push?.subs.length) return null;
  const today = dayOf(now);
  const current = minutesOf(clock.format(now));
  const inWindow = (time: string) => current >= minutesOf(time) && current < minutesOf(time) + window;
  if (inWindow(push.morning) && push.sent.morning !== today && dueTotal(account, now) > 0) return "morning";
  if (inWindow(push.evening) && push.sent.evening !== today && streak(account.workspace, now).atRisk) return "evening";
  return null;
}

export async function runReminders(store: AccountStore, keys: PushKeys, now: number, send: typeof fetch = fetch) {
  let sent = 0;
  for (const owner of await store.pushOwners()) {
    const account = await store.read(owner);
    const which = reminderFor(account, now);
    if (!which || !account.push) continue;
    const alive: Subscription[] = [];
    for (const sub of account.push.subs) {
      try { if (await sendPush(sub, keys, now, send)) alive.push(sub); sent += 1; }
      catch { alive.push(sub); }
    }
    account.push = { ...account.push, subs: alive, sent: { ...account.push.sent, [which]: dayOf(now) } };
    await store.write(owner, account);
  }
  return sent;
}
