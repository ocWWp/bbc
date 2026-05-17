import { describe, it, expect, vi } from "vitest";
import { recordNonce, consumeNonce } from "./oauth-nonce";

const mkClient = (rows: any[] = []) => {
  const calls: any[] = [];
  const client: any = {
    from: () => ({
      insert: (r: any) => { calls.push({ op: "insert", row: r }); return { error: null }; },
      delete: () => ({ eq: (col: string, val: any) => {
        calls.push({ op: "delete", col, val });
        const found = rows.find((r) => r[col] === val);
        return { select: () => ({ single: async () => ({ data: found ?? null, error: null }) }) };
      } }),
    }),
    _calls: calls,
  };
  return client;
};

describe("oauth-nonce", () => {
  it("recordNonce inserts a row with expires_at in the future", async () => {
    const client = mkClient();
    await recordNonce(client, {
      nonce: "n-1", tenant_id: "t-1", actor_user_id: "u-1",
      provider: "google", scopes: ["gmail"], redirect_url: "/library?installed=gmail",
      ttl_seconds: 300,
    });
    expect(client._calls[0].op).toBe("insert");
    expect(client._calls[0].row.nonce).toBe("n-1");
  });

  it("consumeNonce returns the row when present and deletes it", async () => {
    const client = mkClient([{ nonce: "n-1", tenant_id: "t-1" }]);
    const out = await consumeNonce(client, "n-1");
    expect(out?.tenant_id).toBe("t-1");
  });

  it("consumeNonce returns null when nonce is missing", async () => {
    const client = mkClient([]);
    const out = await consumeNonce(client, "missing");
    expect(out).toBeNull();
  });
});
