/** Holds the page still behind a full-screen modal, including mobile Safari. */
export function lockViewport() {
  const root = document.documentElement.style;
  const body = document.body.style;
  const left = window.scrollX;
  const top = window.scrollY;
  const previousRoot = { overflow: root.overflow, overscrollBehavior: root.overscrollBehavior };
  const previousBody = { position: body.position, top: body.top, left: body.left, width: body.width, overflow: body.overflow };
  Object.assign(root, { overflow: "hidden", overscrollBehavior: "none" });
  Object.assign(body, { position: "fixed", top: -top + "px", left: -left + "px", width: "100%", overflow: "hidden" });
  let locked = true;
  return () => {
    if (!locked) return;
    locked = false;
    Object.assign(root, previousRoot);
    Object.assign(body, previousBody);
    window.scrollTo({ left, top, behavior: "instant" });
  };
}
