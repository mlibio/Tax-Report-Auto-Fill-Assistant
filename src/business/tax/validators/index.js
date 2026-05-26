import businessRules from './rules/business';
import crossSheetRules from './rules/crossSheet';
import structuralRules from './rules/structural';
import { runRules } from './ruleEngine';

export const allRules = [
  ...structuralRules,
  ...businessRules,
  ...crossSheetRules,
];

export async function runAllRules(model) {
  return runRules(allRules, model);
}

export { runRules } from './ruleEngine';
export { default as structuralRules } from './rules/structural';
export { default as businessRules } from './rules/business';
export { default as crossSheetRules } from './rules/crossSheet';

export default runAllRules;
