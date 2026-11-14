import { describe, expect, it } from "vitest";
import {
  contextWindowOverflowProbability,
  estimateAgentReverseEngineeringCosts,
} from "../src/core/token-estimator.js";
import type { ReaSemanticSimulationResult } from "../src/core/types.js";

function unprotectedResult(): ReaSemanticSimulationResult {
  return {
    parseStatus: "complete",
    examinationStatus: "complete",
    triggeredResourceLimits: [],
    semanticUncertainties: [],
    visitedAstNodes: 2_000,
    totalFunctions: 40,
    decoyFunctionsDetectedAsReal: 0,
    staticStringsResolved: 60,
    staticStringsOpaque: 0,
    ipcChannelsTotal: 4,
    ipcChannelsPairedUniquely: 4,
    ipcChannelsAmbiguousOrDynamic: 0,
    routesDiscovered: 12,
    decoyRoutesHarvested: 0,
    obligationLedgerNodes: 60,
    architecturalChaffPayloads: 0,
  };
}

function shieldedResult(): ReaSemanticSimulationResult {
  return {
    parseStatus: "recovered",
    examinationStatus: "limited",
    triggeredResourceLimits: ["MODEL_JSON_NESTING", "alias-selections"],
    semanticUncertainties: ["obligation-ledger-cloning"],
    visitedAstNodes: 4_000,
    totalFunctions: 80,
    decoyFunctionsDetectedAsReal: 12,
    staticStringsResolved: 20,
    staticStringsOpaque: 40,
    ipcChannelsTotal: 24,
    ipcChannelsPairedUniquely: 2,
    ipcChannelsAmbiguousOrDynamic: 18,
    routesDiscovered: 48,
    decoyRoutesHarvested: 10,
    obligationLedgerNodes: 300,
    architecturalChaffPayloads: 8,
  };
}

describe("token-estimator", () => {
  it("returns one estimate per model (Opus 4, Sonnet 4, o3)", () => {
    const estimates = estimateAgentReverseEngineeringCosts(unprotectedResult(), 10_000);
    expect(estimates).toHaveLength(3);
    expect(estimates.map((e) => e.modelName).sort()).toEqual([
      "Claude Opus 4 / Claude Code (Deep REA Loop)",
      "Claude Sonnet 4 / Cursor Agent",
      "OpenAI o3 / Codex CLI",
    ]);
  });

  it("unprotected target gets TRIVIAL_CLONE verdict and small call count", () => {
    const estimates = estimateAgentReverseEngineeringCosts(unprotectedResult(), 10_000);
    for (const e of estimates) {
      expect(e.outcomeVerdict).toBe("TRIVIAL_CLONE");
      expect(e.estimatedMcpToolCalls).toBeGreaterThanOrEqual(3);
      expect(e.estimatedMcpToolCalls).toBeLessThanOrEqual(10);
      expect(e.estimatedCostUsd).toBeGreaterThanOrEqual(0.02);
      expect(e.contextWindowOverflowProbability).toBeLessThan(0.1);
    }
  });

  it("shielded target costs strictly more MCP calls than unprotected", () => {
    const cheap = estimateAgentReverseEngineeringCosts(unprotectedResult(), 10_000);
    const expensive = estimateAgentReverseEngineeringCosts(shieldedResult(), 10_000);
    expect(cheap).toHaveLength(expensive.length);
    for (let i = 0; i < cheap.length; i++) {
      expect(expensive[i].estimatedMcpToolCalls).toBeGreaterThan(
        cheap[i]!.estimatedMcpToolCalls,
      );
      expect(expensive[i].estimatedCostUsd).toBeGreaterThan(
        cheap[i]!.estimatedCostUsd,
      );
      expect(expensive[i].contextWindowOverflowProbability).toBeGreaterThan(
        cheap[i]!.contextWindowOverflowProbability,
      );
    }
  });

  it("calls are bounded at 140 and bankruptcy verdict possible", () => {
    const estimates = estimateAgentReverseEngineeringCosts(shieldedResult(), 10_000);
    for (const e of estimates) {
      expect(e.estimatedMcpToolCalls).toBeLessThanOrEqual(140);
      expect(e.estimatedCostUsd).toBeGreaterThanOrEqual(1.5);
      expect([
        "TRIVIAL_CLONE",
        "MODERATE_EFFORT",
        "HIGH_FRICTION",
        "AGENT_HALLUCINATION_AND_BANKRUPTCY",
      ]).toContain(e.outcomeVerdict);
    }
  });
});

describe("context-window overflow probability", () => {
  it("grows with the modelled input history", () => {
    const small = contextWindowOverflowProbability(20_000, 200_000);
    const large = contextWindowOverflowProbability(500_000, 200_000);
    expect(small).toBeGreaterThan(0.02);
    expect(small).toBeLessThan(0.5);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(0.99);
  });

  it("uses the model's declared window instead of a fixed constant", () => {
    expect(contextWindowOverflowProbability(400_000, 200_000)).toBeGreaterThan(
      contextWindowOverflowProbability(400_000, 1_000_000),
    );
  });

  it("stays bounded for tiny histories and invalid windows", () => {
    expect(contextWindowOverflowProbability(0, 200_000)).toBe(0.02);
    expect(contextWindowOverflowProbability(1_000, 0)).toBe(0.02);
    expect(contextWindowOverflowProbability(Number.NaN, 200_000)).toBe(0.02);
  });

  it("is wired into the shielded estimate", () => {
    const shielded = estimateAgentReverseEngineeringCosts(shieldedResult(), 10_000);
    for (const e of shielded) {
      expect(e.contextWindowOverflowProbability).toBeGreaterThan(0.9);
      expect(e.contextWindowOverflowProbability).toBeLessThanOrEqual(0.99);
    }
  });
});
