import { describe, expect, it } from "vitest";
import {
  appendWasmCustomSection,
  inspectWasmBinary,
  protectWasmBinary,
  readWasmCustomSectionContent,
  stripWasmCustomSectionByName,
} from "../src/shields/formats/wasm.js";

// Valid magic + version, then a lone section-id byte with no size LEB128 →
// the section-size header is truncated. The walk helpers must stay defensive.
const TRUNCATED = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x07]);

const WASM_HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
// Export section (id 7), declared size 1, body = lone LEB128 continuation byte.
const TRUNCATED_EXPORT = Buffer.from([...WASM_HEADER, 0x07, 0x01, 0x80]);
// Export section with declared size 0 — no count field at all.
const EMPTY_EXPORT = Buffer.from([...WASM_HEADER, 0x07, 0x00]);
// Export section with a valid zero-entry vector.
const VALID_ZERO_EXPORT = Buffer.from([...WASM_HEADER, 0x07, 0x01, 0x00]);

describe("WASM section walk is defensive on a truncated section header", () => {
  it("inspectWasmBinary returns a summary instead of throwing", () => {
    const info = inspectWasmBinary(TRUNCATED);
    expect(info.validMagic).toBe(true);
    expect(info.sectionCount).toBe(0);
    expect(info.exportNames).toEqual([]);
  });

  it("readWasmCustomSectionContent returns null instead of throwing", () => {
    expect(readWasmCustomSectionContent(TRUNCATED, "name")).toBeNull();
  });

  it("stripWasmCustomSectionByName preserves the bytes instead of throwing", () => {
    const out = stripWasmCustomSectionByName(TRUNCATED, "name");
    expect(out.equals(TRUNCATED)).toBe(true);
  });

  it("appendWasmCustomSection still appends instead of throwing", () => {
    const out = appendWasmCustomSection(TRUNCATED, "bla.sidecar.v1", Buffer.from("x"));
    expect(out.subarray(0, TRUNCATED.length).equals(TRUNCATED)).toBe(true);
    expect(out.toString("latin1")).toContain("bla.sidecar.v1");
  });
});

describe("WASM export decoy injection is defensive on a malformed export section", () => {
  it("keeps a truncated export body instead of throwing", () => {
    const out = protectWasmBinary(TRUNCATED_EXPORT, {
      intensity: "bankrupt",
      seed: "wasm-export-contract",
    });
    expect(out.buffer.subarray(0, TRUNCATED_EXPORT.length).equals(TRUNCATED_EXPORT)).toBe(true);
  });

  it("keeps a size-0 export section instead of throwing", () => {
    const out = protectWasmBinary(EMPTY_EXPORT, {
      intensity: "bankrupt",
      seed: "wasm-export-contract",
    });
    expect(out.buffer.subarray(0, EMPTY_EXPORT.length).equals(EMPTY_EXPORT)).toBe(true);
  });

  it("still injects decoy exports into a valid zero-export module", () => {
    const out = protectWasmBinary(VALID_ZERO_EXPORT, {
      intensity: "bankrupt",
      seed: "wasm-export-contract",
    });
    expect(out.buffer.subarray(0, 8).equals(VALID_ZERO_EXPORT.subarray(0, 8))).toBe(true);
    expect(out.buffer.length).toBeGreaterThan(VALID_ZERO_EXPORT.length);
    expect(inspectWasmBinary(out.buffer).exportNames.length).toBeGreaterThan(0);
  });
});
