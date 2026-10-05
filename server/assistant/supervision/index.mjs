import { runSelfDiagnostics } from "./diagnostics.mjs";
import { ImprovementProposalRegistry, SupervisedSettingsRegistry } from "./improvementProposals.mjs";
import { LearningRegistry } from "./learningRegistry.mjs";

export function createSupervisedDevelopmentSystem(options = {}) {
  const settingsRegistry = options.settingsRegistry ?? new SupervisedSettingsRegistry();
  const learningRegistry = options.learningRegistry ?? new LearningRegistry(options);
  const proposalRegistry = options.proposalRegistry ?? new ImprovementProposalRegistry({
    ...options,
    settingsRegistry,
  });
  return {
    settingsRegistry,
    learningRegistry,
    proposalRegistry,
    async runDiagnostics(context = {}) {
      return runSelfDiagnostics({
        ...context,
        settingsRegistry,
        learningRegistry,
        proposalRegistry,
      });
    },
  };
}

export { runSelfDiagnostics } from "./diagnostics.mjs";
export { ImprovementProposalRegistry, ProposalRisk, ProposalStatus, SupervisedSettingsRegistry } from "./improvementProposals.mjs";
export { LearningRegistry, LearningType } from "./learningRegistry.mjs";
