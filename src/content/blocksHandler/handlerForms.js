import handleFormElement from '@/utils/handleFormElement';
import { sendMessage } from '@/utils/message';
import renderString from '@/workflowEngine/templating/renderString';
import { findAdaptiveTaxVatControl } from '../adaptiveMatch/taxVatAdaptiveMatcher';
import handleSelector, { getDocumentCtx, markElement } from '../handleSelector';
import synchronizedLock from '../synchronizedLock';

async function resolveFormDataValue(data, refData) {
  if (
    !refData ||
    !['text-field', 'select'].includes(data.type) ||
    typeof data.value !== 'string' ||
    !/\{\{[^{}]+\}\}/.test(data.value)
  ) {
    return data;
  }

  // Mirrors the worker-side resolution in handlerInteractionBlock: any
  // unresolved {{...}} reference is replaced with an empty string instead of
  // being typed verbatim into the form field. This is the right default for
  // tax filing where empty cells in Sheet1 simply mean "nothing to declare".
  const renderedResult = await renderString(data.value, refData, {
    defaultUnresolved: '',
  });

  if (renderedResult.unresolvedRefs && renderedResult.unresolvedRefs.length) {
    const lines = renderedResult.unresolvedRefs.map(
      (diag) => `${diag.match} → ${diag.detail || diag.reason}`
    );
    console.warn(
      `[Automa Forms] 检测到 ${
        renderedResult.unresolvedRefs.length
      } 个未能解析的 {{...}} 引用，已用空字符串填充：\n  - ${lines.join(
        '\n  - '
      )}`
    );
  }

  return {
    ...data,
    value: renderedResult.value || '',
  };
}

async function forms(block) {
  const data = await resolveFormDataValue(block.data, block.refData);
  let elements = await handleSelector(block, { returnElement: true });
  let adaptiveMatch = null;

  if (!elements) {
    const canUseAdaptiveMatch =
      !data.getValue &&
      (data.enableAdaptiveMatch ||
        data.adaptiveBusinessContext ||
        !data.selector) &&
      (data.adaptiveDomain || 'tax-vat') === 'tax-vat';

    if (canUseAdaptiveMatch) {
      const documentCtx = getDocumentCtx(block.frameSelector);
      adaptiveMatch = findAdaptiveTaxVatControl(documentCtx || document, data);
      if (adaptiveMatch.ok) {
        elements = adaptiveMatch.element;
      } else {
        // Adaptive match ran but decided not to fill (no business context,
        // no empty controls, confidence too low, or ambiguous). The worker
        // side will write a `forms-adaptive-match` log with the candidate
        // scoring detail and continue the workflow instead of terminating
        // it with `element-not-found`.
        return {
          __formsAdaptiveMatch: {
            ...adaptiveMatch,
            element: undefined,
          },
        };
      }
    } else {
      throw new Error('element-not-found');
    }
  }

  if (data.getValue) {
    let result = '';

    if (data.multiple) {
      result = elements.map((element) => element.value || '');
    } else {
      result = elements.value || '';
    }

    return result;
  }

  async function typeText(element) {
    if (block.debugMode && data.type === 'text-field') {
      // get lock
      await synchronizedLock.getLock();
      element.focus?.();

      try {
        if (data.clearValue) {
          const backspaceCommands = new Array(element.value?.length ?? 0).fill({
            type: 'rawKeyDown',
            unmodifiedText: 'Delete',
            text: 'Delete',
            windowsVirtualKeyCode: 46,
          });

          await sendMessage(
            'debugger:type',
            { commands: backspaceCommands, tabId: block.activeTabId, delay: 0 },
            'background'
          );
        }

        const textValue = data.value || '';
        const commands = textValue.split('').map((char) => ({
          type: 'keyDown',
          text: char === '\n' ? '\r' : char,
        }));
        const typeDelay = +block.data.delay;
        await sendMessage(
          'debugger:type',
          {
            commands,
            tabId: block.activeTabId,
            delay: Number.isNaN(typeDelay) ? 0 : typeDelay,
          },
          'background'
        );
      } finally {
        synchronizedLock.releaseLock();
      }
      return;
    }

    markElement(element, block);
    await handleFormElement(element, data);
  }

  if (data.multiple) {
    const promises = Array.from(elements).map((element) => typeText(element));

    await Promise.allSettled(promises);
  } else {
    await typeText(elements);
  }

  if (adaptiveMatch) {
    return {
      __formsAdaptiveMatch: {
        ...adaptiveMatch,
        element: undefined,
      },
    };
  }

  return null;
}

export default forms;
