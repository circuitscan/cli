#!/usr/bin/env node
import {Command} from 'commander';

import {verify, deploy} from './index.js';
import {instanceSizes, getPackageJson} from './src/utils.js';

const program = new Command();

program
    .name('circuitscan')
    .description('CLI tool to verify verifier contracts by their circom sources')
    .version(getPackageJson().version);

program
    .command('verify <mainCircomFile> <chainId> <verifierContractAddress>')
    .description('Verify verifier contracts by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', 'Specify the proving key url (optional, for Groth16 trusted setups)')
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .action(verify);

// TODO commands to deploy/verify using an existing build package (i.e. in case of tx failure)
// TODO .option('-b, --browser-wallet', 'Send transaction in browser instead of by passing private key env var')
program
    .command('deploy <mainCircomFile> <chainId>')
    .description('Deploy verifier contract by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', 'Specify the proving key url (optional, for Groth16 trusted setups)')
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .action(deploy);

program.parse(process.argv);
