import {deepStrictEqual, strictEqual, ok} from 'node:assert';

import loadCircom from '../src/circom/loadSources.js';

const circomkitRootDir = 'test/circuits/circomkit/';
const vanillaRootDir = 'test/circuits/vanilla/src/';

describe('loadCircom', function() {
  it('should load circomkit.json includes from same dir', function() {
    const file = 'mainB.circom';
    const sources = loadCircom(circomkitRootDir + file);
    const loaded = sources.files;
    const firstKey  = Object.keys(loaded)[0];
    strictEqual(firstKey, file);
    deepStrictEqual(loaded[file].mainComponent, {
      publicSignals: [ 'message', 'scope' ],
      templateName: 'MyTemplate',
      args: [ '9', '4', '10' ],
      full: 'component main { public [  message, scope ] } = MyTemplate(9,4,10);'
    });
    strictEqual(Object.keys(loaded)[1], Object.values(loaded[file].imports)[0]);
    strictEqual(Object.keys(loaded).length, 2);
  });

  it('should load circomkit.json includes from parent dir', function() {
    const file = 'src/mainA.circom';
    const sources = loadCircom(circomkitRootDir + file);
    const loaded = sources.files;
    const firstKey  = Object.keys(loaded)[0];
    strictEqual(firstKey, file);
    deepStrictEqual(loaded[file].mainComponent, {
      publicSignals: [],
      templateName: 'MyTemplate',
      args: [ '9', '4', '10' ],
      full: 'component main = MyTemplate(9,4,10);'
    });
    strictEqual(Object.keys(loaded)[1], Object.values(loaded[file].imports)[0]);
    strictEqual(Object.keys(loaded)[2], Object.values(loaded[file].imports)[1]);
    strictEqual(Object.keys(loaded).length, 3);
  });

  it('should fail when not found', function() {
    const file = 'src/mainC.circom';
    let hadError;
    try {
      const loaded = loadCircom(circomkitRootDir + file);
    } catch(error) {
      hadError = true;
      ok(error.message.startsWith('NOT_FOUND'));
    }
    ok(hadError);
  });

  it('should load from circomlib without circomkit.json', function() {
    const file = 'mainC.circom';
    const sources = loadCircom(vanillaRootDir + file);
    const loaded = sources.files;
    const firstKey  = Object.keys(loaded)[0];
    strictEqual(firstKey, file);
    deepStrictEqual(loaded[file].mainComponent, {
      publicSignals: [],
      templateName: 'MyTemplate',
      args: [ '9', '4', '10' ],
      full: 'component main = MyTemplate(9,4,10);'
    });
    strictEqual(Object.keys(loaded)[1], Object.values(loaded[file].imports)[0]);
    strictEqual(Object.keys(loaded).length, 2);
  });
});
