import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateManifestSigningKeyPair,
  signManifestPayload,
} from "../src/core/manifest-signing.js";
import { handleMcpRequest } from "../src/mcp/server.js";

const dirs: string[] = [];
const dir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bla-mcp-manifest-"));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function signedManifest(): { manifestPath: string; publicKeyPath: string } {
  const base = dir();
  const { privateKeyPem, publicKeyPem } = generateManifestSigningKeyPair();
  const signed = signManifestPayload(
    { schema: "bla-defense-manifest/v1", blaVersion: "3.3.1", detectedFormat: "javascript" },
    privateKeyPem,
  );
  const manifestPath = join(base, "app.js.bla-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(signed, null, 2), "utf8");
  const publicKeyPath = join(base, "trusted.pem");
  writeFileSync(publicKeyPath, publicKeyPem, "utf8");
  return { manifestPath, publicKeyPath };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, any>> {
  return (await handleMcpRequest({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name, arguments: args },
  })) as Record<string, any>;
}

function payload(res: Record<string, any>): Record<string, any> {
  if (res.error) throw new Error(JSON.stringify(res.error));
  return res.result.structuredContent;
}

describe("MCP bla_verify_manifest", () => {
  it("is registered and authenticates a manifest with the pinned key", async () => {
    const { manifestPath, publicKeyPath } = signedManifest();
    const body = payload(
      await callTool("bla_verify_manifest", {
        manifest_path: manifestPath,
        public_key_path: publicKeyPath,
        require_pinned_key: true,
      }),
    );
    expect(body.ok).toBe(true);
    expect(body.pinned).toBe(true);
    expect(body.signed).toBe(true);
  });

  it("reports an unpinned manifest instead of implying the signer is authenticated", async () => {
    const { manifestPath } = signedManifest();
    const body = payload(
      await callTool("bla_verify_manifest", { manifest_path: manifestPath }),
    );
    expect(body.ok).toBe(true);
    expect(body.pinned).toBe(false);
    expect(String(body.reason)).toMatch(/embedded key only/i);
  });

  it("rejects a manifest signed by a different key than the pinned one", async () => {
    const { manifestPath } = signedManifest();
    const other = generateManifestSigningKeyPair();
    const publicKeyPath = join(dir(), "other.pem");
    writeFileSync(publicKeyPath, other.publicKeyPem, "utf8");
    const body = payload(
      await callTool("bla_verify_manifest", { manifest_path: manifestPath, public_key_path: publicKeyPath }),
    );
    expect(body.ok).toBe(false);
    expect(String(body.reason)).toMatch(/does not match/i);
  });

  it("requires manifest_path", async () => {
    const res = await callTool("bla_verify_manifest", {});
    expect(res.error?.code).toBe(-32602);
  });
});