"use client";

import { useEffect, useState } from "react";

async function notify(body: string) {
  await navigator.serviceWorker.register("/kalo-notifications.js");
  const worker = await navigator.serviceWorker.ready;
  await worker.showNotification("Kalo · Zeit zum Wiederholen", { body, icon: "/kalo-192.png", tag: "kalo-review" });
}

export function useReminders(accountId: string, dueCount: number, time: number) {
  const key = "kalo-reminders:" + accountId;
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try { setEnabled(localStorage.getItem(key) === "yes"); } catch { /* Storage is optional. */ }
  }, [key]);

  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(time);
  useEffect(() => {
    if (!enabled || !dueCount || !("Notification" in window) || Notification.permission !== "granted") return;
    const sent = key + ":sent";
    try {
      if (localStorage.getItem(sent) === day) return;
      localStorage.setItem(sent, day);
      void notify("Deine fälligen Karten warten in der Bibliothek.").catch(() => {
        if (localStorage.getItem(sent) === day) localStorage.removeItem(sent);
      });
    } catch { /* No repeated reminders when storage is unavailable. */ }
  }, [day, dueCount, enabled, key]);

  async function request() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Dieser Browser unterstützt hier keine Mitteilungen. Öffne Kalo auf dem iPhone über den Home-Bildschirm.");
    }
    if (await Notification.requestPermission() !== "granted") {
      throw new Error("Erlaube Mitteilungen für Kalo in deinen Browser oder Geräteeinstellungen.");
    }
  }

  return {
    enabled,
    async toggle() {
      if (!enabled) await request();
      localStorage.setItem(key, enabled ? "no" : "yes");
      setEnabled(!enabled);
    },
    async test() {
      await request();
      await notify("So sieht deine Erinnerung für die nächste Kartenwiederholung aus.");
    },
  };
}
