import taxDeclarationV3Template from './templates/taxDeclarationV3Template.json';

export const BUILTIN_TAX_WORKFLOW_ID = 'builtin-tax-declaration-v3';
export const BUILTIN_TAX_WORKFLOW_VERSION =
  taxDeclarationV3Template.builtInVersion || 1;
export const TAX_LOG_COLLECTION_ID = 'tax-vat-general';
export const BUILTIN_TAX_WORKFLOW_NAMES = [
  '税务申报',
  '税务申报-主表',
  '税务申报-附列资料1',
  '税务申报-附列资料2',
  '税务申报-附列资料3',
  '税务申报-附列资料4',
  '税务申报-附列资料5',
];

function cloneWorkflow(workflow) {
  return JSON.parse(JSON.stringify(workflow));
}

function getWorkflowByName(workflowStore, name) {
  return workflowStore.getWorkflows.find((workflow) => workflow.name === name);
}

function normalizeWorkflow(workflow, id) {
  const normalized = cloneWorkflow(workflow);

  normalized.id = id;
  normalized.table = normalized.table || normalized.dataColumns || [];
  normalized.isBuiltIn = true;
  normalized.builtInVersion = BUILTIN_TAX_WORKFLOW_VERSION;
  normalized.updatedAt = normalized.updatedAt || Date.now();

  delete normalized.dataColumns;
  delete normalized.includedWorkflows;

  return normalized;
}

function rewriteExecuteWorkflowIds(workflow, workflowIdMap) {
  const nodes = workflow.drawflow?.nodes;
  if (!Array.isArray(nodes)) return workflow;

  nodes.forEach((node) => {
    const workflowId = node.data?.workflowId;
    if (!workflowId || !workflowIdMap[workflowId]) return;

    node.data.workflowId = workflowIdMap[workflowId];
  });

  return workflow;
}

async function upsertBuiltInWorkflow(workflowStore, workflow, preferredId) {
  const existing =
    workflowStore.getById(preferredId) ||
    getWorkflowByName(workflowStore, workflow.name);
  const id = existing?.id || preferredId;
  const incoming = normalizeWorkflow(workflow, id);

  if (!existing) {
    await workflowStore.insert(incoming, { duplicateId: true });
    return id;
  }

  if (existing.builtInVersion === BUILTIN_TAX_WORKFLOW_VERSION) return id;

  await workflowStore.update({
    id,
    data: incoming,
  });

  return id;
}

/**
 * 在仪表板启动时把税务申报主工作流及其子工作流写入本地工作流仓库。
 *
 * @param {object} workflowStore  Pinia store (useWorkflowStore)
 */
export async function seedBuiltinTaxWorkflows(workflowStore) {
  if (!workflowStore) return;

  const template = cloneWorkflow(taxDeclarationV3Template);
  const workflowIdMap = {};

  await Promise.all(
    Object.entries(template.includedWorkflows || {}).map(
      async ([workflowId, workflow]) => {
        workflowIdMap[workflowId] = await upsertBuiltInWorkflow(
          workflowStore,
          workflow,
          workflowId
        );
      }
    )
  );

  rewriteExecuteWorkflowIds(template, workflowIdMap);
  await upsertBuiltInWorkflow(workflowStore, template, BUILTIN_TAX_WORKFLOW_ID);
}

export default seedBuiltinTaxWorkflows;
