export function readFileAsBase64(blob) {
  return new Promise((resolve) => {
    if (typeof blob === 'string' && blob.startsWith('data:')) {
      resolve(blob);
      return;
    }

    const fileBlob =
      blob instanceof Blob
        ? blob
        : new Blob([
            blob instanceof ArrayBuffer || ArrayBuffer.isView(blob)
              ? blob
              : `${blob || ''}`,
          ]);

    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(fileBlob);
  });
}

function readResponse(response, responseType = 'blob') {
  const type = responseType || 'blob';

  if (type === 'arraybuffer') return response.arrayBuffer();

  return typeof response[type] === 'function'
    ? response[type]()
    : response.blob();
}
async function downloadFile(url, options) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.statusText);

  const type = options.responseType || 'blob';
  const result = await readResponse(response, type);

  if (options.returnValue) {
    return result;
  }

  if (URL.createObjectURL) {
    const objUrl = URL.createObjectURL(result);
    return { objUrl, path: url, type: result.type };
  }
  const base64 = await readFileAsBase64(result);
  return { path: url, objUrl: base64, type: result.type };
}
function getLocalFile(path, options) {
  return new Promise((resolve, reject) => {
    const isFile = /\.(.*)/.test(path);

    if (!isFile) {
      reject(new Error(`"${path}" is invalid file path.`));
      return;
    }

    const fileUrl = path?.startsWith('file://') ? path : `file://${path}`;

    /* eslint-disable-next-line */
    if ('XMLHttpRequest' in self) {
      const xhr = new XMLHttpRequest();
      xhr.responseType = options.responseType || 'blob';
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 0 || xhr.status === 200) {
            if (options.returnValue) {
              resolve(xhr.response);
              return;
            }

            const objUrl = URL.createObjectURL(xhr.response);
            resolve({ path, objUrl, type: xhr.response.type });
          } else {
            reject(new Error(xhr.statusText));
          }
        }
      };
      xhr.onerror = function () {
        reject(
          new Error(xhr.statusText || `Can't find a file with "${path}" path`)
        );
      };
      xhr.open('GET', fileUrl);
      xhr.send();
    } else {
      fetch(fileUrl)
        .then((response) => {
          if (!response.ok) throw new Error(response.statusText);

          if (options.returnValue) {
            return readResponse(response, options.responseType);
          }

          return response.blob();
        })
        .then((blob) => {
          if (options.returnValue) {
            resolve(blob);
            return;
          }
          if (!blob) return;

          if (URL.createObjectURL) {
            const objUrl = URL.createObjectURL(blob);
            resolve({ path, objUrl, type: blob.type });
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({ path, objUrl: reader.result, type: blob.type });
            };
            reader.readAsDataURL(blob);
          }
        })
        .catch(reject);
    }
  });
}

export default function (path, options = {}) {
  if (path.startsWith('http')) return downloadFile(path, options);

  return getLocalFile(path, options);
}
