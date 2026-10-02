import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGINAL_BLOCK = `        if (in_array(strtolower(trim($stepName)), $noWaitSteps)) {
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

const PATCHED_BLOCK = `        if (in_array(strtolower(trim($stepName)), $noWaitSteps)) {
            // Keep saving late offer data, but never let an old step regress an advanced workflow route.
            $currentWorkflow = $this->submissionWorkflowTransitionService->resolveWorkflowNode($submission);
            $currentNode = $currentWorkflow['node'] ?? [];
            $currentNodeType = (string) ($currentNode['type'] ?? '');
            $currentNextNodeKey = (string) ($currentNode['next'] ?? '');

            if ($currentNodeType === 'direct_next' && $currentNextNodeKey === 'credit_card_payment') {
                $submission->current_route = "/offer-summary";
            }

            $submission->save();
            DB::afterCommit(function () use ($submission) {
                event(new SubmissionUpdated($submission));
            });
            return [
                "step" => $step,
                "submission" => $submission,
            ];
        }`;

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function shouldAdvanceOfferSummaryRoute(node) {
  return String(node?.type ?? "") === "direct_next" && String(node?.next ?? "") === "credit_card_payment";
}

export function assertLaravelStepRouteGuard(source) {
  if (!source.includes(PATCHED_BLOCK)) throw new Error("Laravel stale step route guard is missing");
  if (source.includes(ORIGINAL_BLOCK)) throw new Error("Laravel still unconditionally regresses the offer route");
  if (count(source, "$submission->current_route = \"/offer-summary\";") !== 1) {
    throw new Error("Offer summary route assignment must remain unique and guarded");
  }
}

export function patchLaravelStepRouteGuard(source) {
  if (source.includes(PATCHED_BLOCK)) {
    assertLaravelStepRouteGuard(source);
    return { changed: false, content: source };
  }
  if (count(source, ORIGINAL_BLOCK) !== 1) throw new Error("Expected exactly one vulnerable offer step block");
  const content = source.replace(ORIGINAL_BLOCK, PATCHED_BLOCK);
  assertLaravelStepRouteGuard(content);
  return { changed: true, content };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: node patch-laravel-step-route-guard.mjs <SubmissionService.php>");
  const absolutePath = path.resolve(filePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const result = patchLaravelStepRouteGuard(source);
  if (result.changed) await fs.writeFile(absolutePath, result.content, "utf8");
  console.log(`[LaravelStepRouteGuard] ${result.changed ? "patched" : "already-safe"} ${absolutePath}`);
}
