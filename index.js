import {relative, dirname} from 'node:path';

import loadCircom from './src/loadCircom.js';
import {findChainByName} from './src/chains.js';
import {generateRandomString} from './src/utils.js';
import {StatusLogger} from './src/StatusLogger.js';

const defaultCircomPath = 'circom-v2.1.8';
const serverURL = 'http://localhost:9000/2015-03-31/functions/function/invocations';
const circomCompilerURL = 'http://localhost:9001/2015-03-31/functions/function/invocations';
const statusURL = 'https://circuitscan-blobs.s3.us-west-002.backblazeb2.com/status/';

export async function verify(file, chainId, contractAddr, options) {
  if(isNaN(chainId)) {
    const chain = findChainByName(chainId);
    if(!chain) throw new Error('invalid_chain');
    chainId = chain.chain.id;
  }
  const compiled = await compileFile(file, options);
  const verified = await verifyCircuit(compiled.pkgName, chainId, contractAddr, options);
  if(verified && verified.status === 'verified') {
    console.log(`# Completed successfully!`);
  } else {
    console.log(`# Verification failed.`);
  }
}

async function compileFile(file, options) {
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

  const requestId = generateRandomString(40);
  // status report during compilation
  const status = new StatusLogger(`${statusURL}${requestId}.json`, 3000);

  const event = {
    payload: {
      requestId,
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
  console.log(`Found ${Object.keys(files).length} file(s):
    ${Object.keys(files).join('\n    ')}
`);

  const response = await fetch(circomCompilerURL, {
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
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    console.error(body.errorMessage);
    throw new Error('Invalid compilation result');
  }

  status.stop();
  return body;
}

async function verifyCircuit(pkgName, chainId, contractAddr, options) {
  const event = {
    payload: {
      action: 'verifyCircom',
      pkgName,
      chainId,
      contract: contractAddr,
    },
  };
  console.log(`# Verifying circuit...`);

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
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error(`Verification error: ${body.errorMessage}`);
  }

  return body;
}

function fixImportPaths(code, path, imports) {
  for(let thisImport of Object.keys(imports)) {
    const rel = relative(path, imports[thisImport]);
    code = code.replaceAll(`include "${thisImport}"`, `include "${rel}"`);
  }
  return code;
}
