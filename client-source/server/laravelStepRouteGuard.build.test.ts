import { describe, expect, it } from "vitest";
import {
  assertLaravelStepRouteGuard,
  patchLaravelStepRouteGuard,
  shouldAdvanceOfferSummaryRoute,
} from "../scripts/patch-laravel-step-route-guard.mjs";

const vulnerableBlock = `        if (in_array(strtolower(trim($stepName)), $noWaitSteps)) {
            // Broadcast so admin panel sees the data, but do NOT change status
            $submission->current_route = "/offer-summary";
            $submission->save();
            DB::afterCommit(function () use ($submission) {
                event(new SubmissionUpdated($submission));
            });
            return [
                "step" => $step,
                "submission" => $submission,
            ];
        }`;

describe("Laravel stale step route regression guard", () => {
  it("allows the offer route only while workflow remains on an offer-side node", () => {
    expect(shouldAdvanceOfferSummaryRoute({ type: "direct_next", next: "credit_card_payment" })).toBe(true);
    expect(shouldAdvanceOfferSummaryRoute({ type: "direct_next", next: "insurance_details" })).toBe(false);
    expect(shouldAdvanceOfferSummaryRoute({ type: "admin_gate", next: "otp" })).toBe(false);
  });

  it("keeps saving and broadcasting a late step without regressing current_route", () => {
    const result = patchLaravelStepRouteGuard(`<?php\n${vulnerableBlock}\n`);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("resolveWorkflowNode($submission)");
    expect(result.content).toContain("$currentNodeType === 'direct_next'");
    expect(result.content).toContain("$currentNextNodeKey === 'credit_card_payment'");
    expect(result.content).toContain("$submission->save();");
    expect(result.content).toContain("event(new SubmissionUpdated($submission));");
    expect(() => assertLaravelStepRouteGuard(result.content)).not.toThrow();

    const secondPass = patchLaravelStepRouteGuard(result.content);
    expect(secondPass.changed).toBe(false);
  });
});
