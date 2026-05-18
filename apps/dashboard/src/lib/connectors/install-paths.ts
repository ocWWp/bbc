// Maps a connector_id to its Phase K install page route. Returns undefined
// when no install page exists for that connector (e.g. notion, linear,
// generic webhook — callers should hide the Reconnect button in that case).
//
// gmail and drive both resolve to /library/install/google because the
// OAuth grant is per-Google-project, not per-API.

export function installPathFor(connector_id: string): string | undefined {
  switch (connector_id) {
    case "github":
      return "/library/install/github";
    case "gmail":
    case "drive":
      return "/library/install/google";
    default:
      return undefined;
  }
}
