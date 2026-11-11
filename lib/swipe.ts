export function dragOffset(distance: number, width: number, previous: boolean, next: boolean) {
  if (distance > 0 ? previous : next) return distance;
  const scaled = Math.abs(distance) * 0.32;
  return Math.sign(distance) * scaled * width / (width + scaled);
}

export function swipeStep(distance: number, velocity: number, width: number, previous: boolean, next: boolean) {
  if (Math.abs(distance) < 10) return 0;
  const projected = distance + Math.max(-1.6, Math.min(1.6, velocity)) * 105;
  const threshold = Math.min(85, width * 0.22);
  if (projected < -threshold && next) return 1;
  if (projected > threshold && previous) return -1;
  return 0;
}
