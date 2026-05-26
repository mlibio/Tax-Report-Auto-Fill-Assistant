import { messageSandbox } from '../helper';
import mustacheReplacer from './mustacheReplacer';

const isFirefox = BROWSER_TYPE === 'firefox';

export default async function (str, data, options = {}) {
  if (!str || typeof str !== 'string') return '';

  const hasMustacheTag = /\{\{(.*?)\}\}/.test(str);
  if (!hasMustacheTag) {
    return {
      list: {},
      unresolvedRefs: [],
      value: str,
    };
  }

  // The third argument was historically passed by some callers as a boolean
  // (`isPopup`), so anything that isn't a plain options object is normalised
  // to `{}` here. This keeps the new options (`defaultUnresolved`,
  // `onUnresolvedRef`, ...) safe to use without breaking existing callers.
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : {};

  let renderedValue = {};
  const evaluateJS = str.startsWith('!!');

  if (evaluateJS && !isFirefox) {
    const refKeysRegex =
      /(variables|table|secrets|loopData|workflow|googleSheets|globalData)@/g;
    const strToRender = str.replace(refKeysRegex, '$1.');

    renderedValue = await messageSandbox('blockExpression', {
      str: strToRender,
      data,
    });
  } else {
    let copyStr = `${str}`;
    if (evaluateJS) copyStr = copyStr.slice(2);

    renderedValue = mustacheReplacer(copyStr, data, safeOptions);
  }

  if (!renderedValue.unresolvedRefs) renderedValue.unresolvedRefs = [];

  return renderedValue;
}
