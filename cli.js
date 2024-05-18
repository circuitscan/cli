#!/usr/bin/env node
import {Command} from 'commander';

import {verify} from './index.js';

const program = new Command();

program
    .name('circuitscan')
    .description('CLI tool to verify verifier contracts by their circom sources')
    .version('0.0.1');

program
    .command('verify <mainCircomFile> <chainId> <verifierContractAddress>')
    .description('Verify verifier contracts by their circom sources')
    .action(verify);

program.parse(process.argv);
