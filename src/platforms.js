export function surfaceHeight(platform, x) {
  if (platform.endY === undefined) return platform.y;
  const progress = (x - platform.left) / (platform.right - platform.left);
  return platform.y + (platform.endY - platform.y) * progress;
}
