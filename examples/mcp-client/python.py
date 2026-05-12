#!/usr/bin/env python3
"""
BBC brain client — Python example.

Usage:
    export BBC_URL="http://localhost:3000"
    export BBC_API_KEY="bbc_xxx.yyy"
    python python.py

Uses only the stdlib (urllib + json).
"""

import json
import os
import sys
import urllib.error
import urllib.request


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        print(f"Missing env var {name}", file=sys.stderr)
        sys.exit(1)
    return v


BBC_URL = _env("BBC_URL").rstrip("/")
BBC_API_KEY = _env("BBC_API_KEY")


def _post_mcp(method: str, params: dict | None = None) -> dict:
    """Send a JSON-RPC request to /api/mcp and return result. Raises on error."""
    body = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params is not None:
        body["params"] = params
    req = urllib.request.Request(
        f"{BBC_URL}/api/mcp",
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {BBC_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            envelope = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')}")

    if "error" in envelope:
        raise SystemExit(f"MCP {method}: {envelope['error']['code']} {envelope['error']['message']}")
    return envelope.get("result", {})


def call_tool(name: str, args: dict | None = None):
    """Call a tool via tools/call and parse its content[0].text payload."""
    res = _post_mcp("tools/call", {"name": name, "arguments": args or {}})
    if res.get("isError"):
        text = res.get("content", [{}])[0].get("text", "(unknown)")
        raise SystemExit(f"Tool {name} returned error: {text}")
    text = res.get("content", [{}])[0].get("text", "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def main():
    # 1. Probe.
    init = _post_mcp("initialize")
    info = init["serverInfo"]
    print(f"Connected to {info['name']} v{info['version']}")

    # 2. Tools list.
    tools = _post_mcp("tools/list")["tools"]
    print(f"Server exposes {len(tools)} tools: {', '.join(t['name'] for t in tools)}")

    # 3. Recent decisions.
    decisions = call_tool("list_decisions", {"limit": 5})
    print(f"\nLatest {len(decisions)} decisions:")
    for d in decisions:
        print(f"  - {d['title']} ({d['id'][:8]}…)")

    # 4. Keyword search.
    hits = call_tool("search_memories", {"query": "auth", "limit": 3})
    print(f"\nSearch hits for 'auth' ({len(hits)}):")
    for m in hits:
        print(f"  - [{m.get('type') or '?'}] {m['title']}")


if __name__ == "__main__":
    main()
