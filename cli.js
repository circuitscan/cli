#!/usr/bin/env node
import {Command} from 'commander';

import {
  getPackageJson,
} from './src/utils.js';

import circomCommands from './src/circom/index.js';
import circomMultiCommands from './src/circomMulti/index.js';

const program = new Command();

program
  .name('circuitscan')
  .description('CLI tool to verify verifier contracts by their circom sources')
  .version(getPackageJson().version);

// Each pipeline adds its commands
circomCommands(program);
circomMultiCommands(program);

program.parse(process.argv);
