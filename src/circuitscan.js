import {join} from 'node:path';
import {readFileSync, appendFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';

import {
  generateRandomString,
  delay,
  instanceSizes,
  fetchWithRetry,
} from './utils.js';
import {StatusLogger} from './StatusLogger.js';

async function determineCompilerUrl(options) {
  if(process.env.LOCAL_COMPILER) {
    return {
      curCompilerURL: process.env.LOCAL_COMPILER,
    };
  }
  return {
    curCompilerURL: options.config.ec2CompilerURL,
  };
}

async function resumeCompileFile(options) {
  const requestId = options.resume;
  if('instance' in options && !(options.instance in instanceSizes))
    throw new Error('INVALID_INSTANCE_SIZE');
  // status report during compilation
  const status = new StatusLogger(`${options.config.blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));

  while(!status.lastData || !status.lastData.find(x => x.msg === 'Complete.')) {
    await delay(5000);
  }
  status.stop();
  let pkgName;
  for(let i = 0; i < status.lastData.length; i++) {
    if(status.lastData[i].msg.startsWith('Compiling ')) {
      pkgName = status.lastData[i].msg.slice(10, -3);
      break;
    }
  }
  if(!pkgName) throw new Error('INVALID_RESUME_LOG');
  return { pkgName };
}

export async function invokeRemoteMachine(payload, options) {
  if(options.resume) return resumeCompileFile(options);
  const requestId = generateRandomString(40);
  console.log(`# Request ID: ${requestId}`);
  appendRequest(requestId);
  if('instance' in options && !(options.instance in instanceSizes))
    throw new Error('INVALID_INSTANCE_SIZE');
  const instanceType = options.instance ? instanceSizes[options.instance] : undefined;
  // status report during compilation
  const status = new StatusLogger(`${options.config.blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));

  const apiKey = activeApiKey(options);
  const event = {
    apiKey,
    payload: {
      ...payload,
      requestId,
      instanceType,
    },
  };

  const {curCompilerURL} = await determineCompilerUrl(options);
  const response = await fetchWithRetry(curCompilerURL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Network response was not ok: ' + body);
  }
  const data = await response.json();
  let body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error(body.errorMessage);
  }

  if(data.status === 'ok' && instanceType) {
    console.log('# Instance started. Wait a few minutes for initialization...');
    // Other statuses will arrive from the StatusLogger
    const {stderr, stdout} = await watchInstance(options.config.blobUrl, requestId, apiKey, options, 8000);
    console.error(stderr);
    console.log(stdout);
    const response = await fetchWithRetry(`${options.config.blobUrl}instance-response/${requestId}.json`);
    try {
      const data = await response.json();
      body = JSON.parse(data.body);
    } catch(error) {
      throw new Error('Compilation was not successful.');
    }
  }
  status.stop();
  return body;
}

export async function verifyCircuit(action, pkgName, chainId, contract, options) {
  const event = {payload: {action, pkgName, chainId, contract}};
  console.log(`# Verifying circuit...`);

  const response = await fetchWithRetry(options.config.serverURL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok && response.status !== 400) {
    console.error(response);
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error(`Verification error: ${body.errorMessage}`);
  }

  if(body && body.status === 'verified') {
    console.log(`# Completed successfully!`);
    console.log(`\nhttps://circuitscan.org/chain/${chainId}/address/${contract}`);
  } else {
    console.log(`# Verification failed.`);
  }
  return body;
}

function appendRequest(reqId) {
  appendFileSync(join(homedir(), '.circuitscan-history'), `${reqId}\n`);
}

export function loginCommand(program) {
  program
    .command('login <apiKey>')
    .description('Save API Key in home directory for later use.')
    .action((apiKey) => {
      const config = loadUserConfig() || {};
      config.apiKey = apiKey;
      writeFileSync(join(homedir(), '.circuitscan'), JSON.stringify(config, null, 2));
    });
}

export function stopInstanceCommand(program) {
  program
    .command('terminate <requestId>')
    .description('Terminate a running compilation job')
    .action(async (requestId) => {
      const apiKey = loadUserConfig().apiKey;
      const body = terminateInstance(requestId, apiKey);
      console.log(body);
    });
}

function loadUserConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.circuitscan'), 'utf8'));
  } catch(error) {
    // Do nothing
  }
}

function activeApiKey(options) {
  if(options.apiKey) return options.apiKey;
  if(process.env.CIRCUITSCAN_API_KEY) return process.env.CIRCUITSCAN_API_KEY;
  const config = loadUserConfig() || {};
  if(!config.apiKey) {
    console.error('\n\nMissing API Key!\n\nGenerate one at https://circuitscan.org/manage-api-key\nThen use "circuitscan login <apiKey>"');
    process.exit(1);
  }
  return config.apiKey;
}

function watchInstance(blobUrl, requestId, apiKey, options, timeout) {
  return new Promise((resolve, reject) => {
    let ip, healthcheckInterval;
    const interval = setInterval(async () => {
      try {
        if(!ip) {
          ip = (await fetchResult(blobUrl, requestId, 'ip')).trim();
          console.log(`# Instance running at ${ip}...`);
          healthcheckInterval = setInterval(async () => {
            try {
              await healthcheckFetch(ip, timeout - 1000);
            } catch(error) {
              if(error instanceof TimeoutError) {
                // Instance is not responding
                console.log(
                  '\n\n# Instance health check failed, terminating!\n' +
                  '# Possible out-of-memory exception. Try a larger instance size.\n\n'
                );

                try {
                  const response = await terminateInstance(requestId, apiKey, options);
                  if(response.status !== 'ok') {
                    console.error(response);
                  }
                } catch(error) {
                  // Not a big deal, just display it
                  console.error(error);
                }
              }
              clearInterval(interval);
              clearInterval(healthcheckInterval);
              reject(error);
            }
          }, timeout);
        }
        const stderr = await fetchResult(blobUrl, requestId, 'stderr');
        const stdout = await fetchResult(blobUrl, requestId, 'stderr');
        clearInterval(interval);
        clearInterval(healthcheckInterval);
        resolve({ stderr, stdout });
      } catch(error) {
        if(!(error instanceof NotFoundError)) {
          clearInterval(interval);
          clearInterval(healthcheckInterval);
          reject(error);
        }
      }
    }, timeout);
  });
}

function healthcheckFetch(ip, timeout) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new TimeoutError()), timeout)
  );
  const fetchPromise = fetchWithRetry(`http://${ip}:3000`);
  return Promise.race([fetchPromise, timeoutPromise]);
}

async function terminateInstance(requestId, apiKey, options) {
  const event = {payload: {requestId}, apiKey};
  const response = await fetch(process.env.LOCAL_TERMINATOR || (options && options.config && options.config.terminatorURL), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok && response.status !== 400) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  const body = 'body' in data ? JSON.parse(data.body) : data;
  return body;
}

async function fetchResult(blobUrl, requestId, pipename) {
  const response = await fetchWithRetry(`${blobUrl}instance/${requestId}/${pipename}.txt`);
  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      throw new NotFoundError;
    } else {
      console.log(response);
      throw new Error('Error while checking instance state');
    }
  }
  const data = await response.text();
  return data;
}

class NotFoundError extends Error {}
class TimeoutError extends Error {}

