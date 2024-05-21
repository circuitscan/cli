import {relative, dirname} from 'node:path';

import loadCircom from './src/loadCircom.js';

const defaultCircomPath = 'circom-v2.1.8';
const serverURL = 'http://localhost:9000/2015-03-31/functions/function/invocations';

export async function verify(file, chainId, contractAddr, options) {
  const loaded = loadCircom(file);
  const shortFile = Object.keys(loaded.files)[0];
  if(!loaded.files[shortFile].mainComponent) throw new Error('MISSING_MAIN_COMPONENT');

  // Remove main component since compilation server recreates it using circomkit
  loaded.files[shortFile].circomCode =
    loaded.files[shortFile].circomCode.replace(loaded.files[shortFile].mainComponent.full, '');

  // For privacy, only use the necessary amount of directory depth
  const files = Object.keys(loaded.files).reduce((out, cur) => {
    out[cur] = {
      code: fixImportPaths(loaded.files[cur].circomCode, dirname(cur), loaded.files[cur].imports),
    };
    return out;
  }, {});

  const event = {
    payload: {
      action: 'build',
      files,
      // TODO support passing filename for base64 if small enough or temp upload otherwise
      finalZkey: options.provingKey,
      circomPath: options.circomVersion ? 'circom-' + options.circomVersion : defaultCircomPath,
      protocol: options.protocol || (loaded.circomkit && loaded.circomkit.protocol) || 'groth16',
      circuit: {
        file: shortFile.slice(0, -7), // remove .circom
        template: loaded.files[shortFile].mainComponent.templateName,
        params: loaded.files[shortFile].mainComponent.args,
        pubs: loaded.files[shortFile].mainComponent.publicSignals,
      },
    },
  };
  console.log(event);

  // TODO status report during compilation
  const response = await fetch(serverURL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
      throw new Error('Network response was not ok');
  }
  const data = await response.json();
  console.log(data);

  // TODO invoke verification lambda with package name
}

function fixImportPaths(code, path, imports) {
  for(let thisImport of Object.keys(imports)) {
    const rel = relative(path, imports[thisImport]);
    code = code.replaceAll(`include "${thisImport}"`, `include "${rel}"`);
  }
  return code;
}
