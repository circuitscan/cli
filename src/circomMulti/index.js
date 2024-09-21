import {readFileSync} from 'node:fs';

import {
  loadConfig,
  DEFAULT_CONFIG,
} from '../utils.js';

export default function(program) {
  program
    .command('verify:circom-multi <jsonFile>')
    .description('Verify a Groth16 multi-verifier using a JSON specification. See docs website for details.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .action(verifyMulti);
}

async function verifyMulti(file, options) {
  options = await loadConfig(options);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const event = {
    payload: {
      ...parsed,
      action: 'verifyCircomMulti',
    },
  };
  console.log(`# Verifying groth16 multi-verifier...`);

  const response = await fetch(options.config.serverURL, {
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
  if('errorType' in body) {
    throw new Error(`Verification error: ${body.errorMessage}`);
  }

  if(body && body.status === 'verified') {
    console.log(`# Completed successfully!`);
    console.log(`\nhttps://circuitscan.org/chain/${parsed.deployed.chainId}/address/${parsed.deployed.address}`);
  } else {
    console.log(`# Verification failed.`);
  }
}
