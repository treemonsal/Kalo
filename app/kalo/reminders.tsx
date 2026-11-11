"use client";

import { useEffect } from "react";
import { useStored, writeStored } from "./storage";

async function notify(body: string) {
  await navigator.serviceWorker.register("/kalo-notifications.js");
  const worker = await navigator.serviceWorker.ready;
  await worker.showNotification("Kalo · Zeit zum Wiederholen", { body, icon: "/kalo-192.png", tag: "kalo-review" });
}

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" });

export function useReminders(accountId: string, dueCount: number, time: number) {
  const key = "kalo-reminders:" + accountId;
  const enabled = useStored(key) === "yes";
  const day = dayFormat.format(time);

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
      writeStored(key, enabled ? "no" : "yes");
    },
    async test() {
      await request();
      await notify("So sieht deine Erinnerung für die nächste Kartenwiederholung aus.");
    },
  };
}
