import { MAIN_LINES, META_FIELDS } from '../schema/vatGeneralSchema';

/**
 * 把解析结果包装成可被规则引擎与映射模块直接消费的扁平模型。
 * 暴露的字段：
 *   - meta.<id>: 头部信息（纳税人、税款所属时间等）
 *   - line<N>.{generalCurrent, generalYear, refundCurrent, refundYear}: 主表栏次
 *   - appendix.appendix{1..4}.<key>: 附表合计
 *   - get(path): 路径取值，如 model.get('line11.generalCurrent')
 */
export function createVatModel(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('createVatModel: 解析结果为空');
  }

  const model = {
    schemaVersion: parsed.schemaVersion,
    parsedAt: parsed.parsedAt,
    meta: { ...parsed.meta },
    lines: {},
    appendix: parsed.appendix
      ? JSON.parse(JSON.stringify(parsed.appendix))
      : {},
  };

  for (const def of MAIN_LINES) {
    const value = parsed.lines?.[def.id] || {};
    model.lines[def.id] = {
      line: def.line,
      label: def.label,
      generalCurrent: value.generalCurrent ?? null,
      generalYear: value.generalYear ?? null,
      refundCurrent: value.refundCurrent ?? null,
      refundYear: value.refundYear ?? null,
    };
  }

  Object.defineProperty(model, 'get', {
    enumerable: false,
    value(path) {
      if (!path) return undefined;
      return path
        .split('.')
        .reduce(
          (acc, key) => (acc == null ? acc : acc[key]),
          /** @type {any} */ (model)
        );
    },
  });

  Object.defineProperty(model, 'lineValue', {
    enumerable: false,
    value(lineId, column = 'generalCurrent') {
      return model.lines?.[lineId]?.[column] ?? null;
    },
  });

  Object.defineProperty(model, 'fields', {
    enumerable: false,
    get() {
      return {
        meta: META_FIELDS,
        lines: MAIN_LINES,
      };
    },
  });

  return model;
}

export default createVatModel;
