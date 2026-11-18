export function dragOffset(distance: number, width: number, previous: boolean, next: boolean) {
  if (distance > 0 ? previous : next) return distance;
  const scaled = Math.abs(distance) * 0.32;
  return Math.sign(distance) * scaled * width / (width + scaled);
}

export function swipeStep(distance: number, velocity: number, width: number, previous: boolean, next: boolean) {
  if (Math.abs(distance) < 8) return 0;
  const speed = Number.isFinite(velocity) ? velocity : 0;
  const projected = distance + Math.max(-1.8, Math.min(1.8, speed)) * 130;
  const threshold = Math.max(32, Math.min(56, width * 0.14));
  if (projected < -threshold && next) return 1;
  if (projected > threshold && previous) return -1;
  return 0;
}

/** A small diagonal is still a horizontal swipe; vertical reading needs a clearer intent. */
export function swipeIntent(x: number, y: number): "pending" | "horizontal" | "vertical" {
  if (Math.abs(x) >= 8 && Math.abs(x) >= Math.abs(y) * .8) return "horizontal";
  if (Math.abs(y) >= 14 && Math.abs(y) > Math.abs(x) * 1.4) return "vertical";
  return "pending";
}
