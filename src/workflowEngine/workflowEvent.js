import { nanoid } from 'nanoid';
import { messageSandbox } from './helper';

class WorkflowEvent {
  static async #httpRequest() {
    throw new Error('HTTP request events are disabled in local-only mode');
  }

  static async #javascriptCode(event, refData) {
    const instanceId = `automa${nanoid()}`;

    await messageSandbox('javascriptBlock', {
      refData,
      instanceId,
      preloadScripts: [],
      blockData: {
        code: event.code,
      },
    });
  }

  static async handle(event, refData) {
    switch (event.type) {
      case 'http-request':
        await this.#httpRequest(event, refData);
        break;
      case 'js-code':
        await this.#javascriptCode(event, refData);
        break;
      default:
    }
  }
}

export default WorkflowEvent;
