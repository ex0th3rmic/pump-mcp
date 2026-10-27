export const consoleViews = ["playground", "coins", "trade", "launch", "api", "activity", "help"] as const;
export type ConsoleView = (typeof consoleViews)[number];

export const route = $state({ path: window.location.pathname });

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  route.path = path;
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function viewFromPath(path: string): ConsoleView | null {
  if (path === "/app" || path === "/app/") return "coins";
  const part = path.slice("/app/".length).split("/")[0];
  return consoleViews.includes(part as ConsoleView) ? part as ConsoleView : null;
}

window.addEventListener("popstate", () => {
  route.path = window.location.pathname;
});
