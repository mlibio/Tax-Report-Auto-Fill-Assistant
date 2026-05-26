import objectPath from 'object-path';
import credentialUtil from '@/utils/credentialUtil';
import { parseJSON } from '@/utils/helper';
import templatingFunctions from './templatingFunctions';

const refKeys = {
  table: 'table',
  dataColumn: 'table',
  dataColumns: 'table',
};

export function extractStrFunction(str) {
  const extractedStr = /^\$\s*(\w+)\s*\((.*)\)/.exec(
    str.trim().replace(/\r?\n|\r/g, '')
  );

  if (!extractedStr) return null;
  const { 1: name, 2: funcParams } = extractedStr;
  const params = funcParams
    .split(/,(?=(?:[^'"\\"\\']*['"][^'"]*['"\\"\\'])*[^'"]*$)/)
    .map((param) => param.trim().replace(/^['"]|['"]$/g, '') || '');

  return {
    name,
    params,
  };
}

export function keyParser(key, data) {
  let [dataKey, path] = key.split(/[@.](.+)/);

  dataKey = refKeys[dataKey] ?? dataKey;

  if (!path) return { dataKey, path: '' };

  if (dataKey !== 'table') {
    if (dataKey === 'loopData' && !path.endsWith('.$index')) {
      const pathArr = path.split('.');
      pathArr.splice(1, 0, 'data');

      path = pathArr.join('.');
    }

    return { dataKey, path };
  }

  const [firstPath, restPath] = path.split(/\.(.+)/);

  if (firstPath === '$last') {
    const lastIndex = data.table.length - 1;

    path = `${lastIndex}.${restPath || ''}`;
  } else if (!restPath) {
    path = `0.${firstPath}`;
  } else if (typeof +firstPath !== 'number' || Number.isNaN(+firstPath)) {
    path = `0.${firstPath}.${restPath}`;
  }

  path = path.replace(/\.$/, '');

  return { dataKey: 'table', path };
}

function resolvePathValue(data, dataKey, path) {
  const value = objectPath.get(data[dataKey], path);
  if (typeof value !== 'undefined') return value;

  const [rootPath, restPath] = path.split(/\.(.+)/);
  if (!restPath) return value;

  const rootValue = objectPath.get(data[dataKey], rootPath);
  if (typeof rootValue !== 'string') return value;

  const parsedRootValue = parseJSON(rootValue, null);
  if (!parsedRootValue || typeof parsedRootValue !== 'object') return value;

  return objectPath.get(parsedRootValue, restPath);
}

// Build a structured diagnostic for an unresolved {{...}} reference so the
// caller (e.g. the Forms block) can explain to the user *why* a placeholder
// could not be filled in (missing variable, sparse cell, wrong type, etc.).
function describeUnresolvedRef(data, dataKey, path, match) {
  const diagnostic = {
    match,
    dataKey,
    path,
    reason: 'unknown',
    detail: '',
  };

  const root = data ? data[dataKey] : undefined;
  if (typeof root === 'undefined' || root === null) {
    diagnostic.reason = 'data-key-missing';
    diagnostic.detail = `data namespace "${dataKey}" is not available`;
    return diagnostic;
  }

  if (!path) {
    diagnostic.reason = 'value-undefined';
    diagnostic.detail = `value at "${dataKey}" is undefined`;
    return diagnostic;
  }

  const segments = path.split('.');
  let current = root;
  let traversedPath = dataKey;

  for (let index = 0; index < segments.length; index += 1) {
    const seg = segments[index];

    if (current === null || typeof current === 'undefined') {
      diagnostic.reason = 'path-broken';
      diagnostic.detail = `"${traversedPath}" is null/undefined, cannot read "${seg}"`;
      return diagnostic;
    }

    if (typeof current === 'string') {
      const parsed = parseJSON(current, null);
      if (parsed && typeof parsed === 'object') {
        current = parsed;
      } else {
        diagnostic.reason = 'wrong-type';
        diagnostic.detail = `"${traversedPath}" is a plain string, cannot read "${seg}"`;
        return diagnostic;
      }
    }

    if (Array.isArray(current)) {
      const numericIndex = +seg;
      if (Number.isNaN(numericIndex)) {
        diagnostic.reason = 'path-non-numeric-on-array';
        diagnostic.detail = `"${traversedPath}" is an array of length ${current.length}, but path segment "${seg}" is not a number`;
        return diagnostic;
      }
      if (numericIndex < 0 || numericIndex >= current.length) {
        diagnostic.reason = 'index-out-of-bounds';
        diagnostic.detail = `index ${numericIndex} is out of bounds for "${traversedPath}" (length ${current.length})`;
        return diagnostic;
      }
      current = current[numericIndex];
    } else if (typeof current === 'object') {
      if (!(seg in current)) {
        diagnostic.reason = 'key-missing';
        diagnostic.detail = `key "${seg}" not found at "${traversedPath}"`;
        return diagnostic;
      }
      current = current[seg];
    } else {
      diagnostic.reason = 'wrong-type';
      diagnostic.detail = `"${traversedPath}" is a ${typeof current}, cannot read "${seg}"`;
      return diagnostic;
    }

    traversedPath = `${traversedPath}.${seg}`;
  }

  if (typeof current === 'undefined') {
    diagnostic.reason = 'cell-undefined';
    diagnostic.detail = `cell at "${dataKey}.${path}" is undefined (empty cell or sparse data)`;
  } else if (current === null) {
    diagnostic.reason = 'value-null';
    diagnostic.detail = `value at "${dataKey}.${path}" is null`;
  }

  return diagnostic;
}

function replacer(
  str,
  {
    data,
    regex,
    tagLen,
    modifyPath,
    checkExistence = false,
    disableStringify = false,
    defaultUnresolved,
    onUnresolvedRef,
  }
) {
  const replaceResult = {
    list: {},
    unresolvedRefs: [],
    value: str,
  };

  replaceResult.value = str.replace(regex, (match) => {
    let key = match.slice(tagLen, -tagLen).trim();

    if (!key) return '';

    let result = '';
    let stringify = false;
    const isFunction = extractStrFunction(key);
    const funcRef = isFunction && data.functions[isFunction.name];

    if (modifyPath && !funcRef) {
      key = modifyPath(key);
    }

    if (funcRef) {
      const funcParams = isFunction.params.map((param) => {
        const { value, list } = replacer(param, {
          data,
          tagLen: 1,
          regex: /\[(.*?)\]/,
        });

        Object.assign(replaceResult.list, list);

        return parseJSON(value, value);
      });

      result = funcRef.apply({ refData: data }, funcParams);
    } else {
      /* eslint-disable-next-line */
      let { dataKey, path } = keyParser(key, data);
      if (dataKey.startsWith('!')) {
        stringify = true;
        dataKey = dataKey.slice(1);
      }

      if (checkExistence) return objectPath.has(data[dataKey], path);

      result = resolvePathValue(data, dataKey, path);

      if (typeof result === 'undefined') {
        const diagnostic = describeUnresolvedRef(data, dataKey, path, match);
        replaceResult.unresolvedRefs.push(diagnostic);

        if (typeof onUnresolvedRef === 'function') {
          try {
            onUnresolvedRef(diagnostic);
          } catch (_) {
            // never let a diagnostic callback break templating
          }
        }

        if (typeof defaultUnresolved === 'string') {
          result = defaultUnresolved;
        } else {
          result = match;
        }
      }

      if (dataKey === 'secrets') {
        result =
          typeof result !== 'string' ? {} : credentialUtil.decrypt(result);
      }
    }

    const finalResult =
      disableStringify || (typeof result === 'string' && !stringify)
        ? result
        : JSON.stringify(result);

    replaceResult.list[match] = finalResult?.slice(0, 512) ?? finalResult;

    return finalResult;
  });

  return replaceResult;
}

export default function (str, refData, options = {}) {
  if (!str || typeof str !== 'string') return '';

  const data = { ...refData, functions: templatingFunctions };
  const replacedList = {};
  const innerUnresolvedRefs = [];

  const replacedStr = replacer(`${str}`, {
    data,
    tagLen: 2,
    regex: /\{\{(.*?)\}\}/g,
    modifyPath: (path) => {
      const inner = replacer(path, {
        data,
        tagLen: 1,
        regex: /\[(.*?)\]/g,
        ...options,
        checkExistence: false,
      });
      Object.assign(replacedList, inner.list);
      if (inner.unresolvedRefs && inner.unresolvedRefs.length) {
        innerUnresolvedRefs.push(...inner.unresolvedRefs);
      }

      return inner.value;
    },
    ...options,
  });

  Object.assign(replacedStr.list, replacedList);
  if (innerUnresolvedRefs.length) {
    replacedStr.unresolvedRefs = [
      ...(replacedStr.unresolvedRefs || []),
      ...innerUnresolvedRefs,
    ];
  }

  return replacedStr;
}
