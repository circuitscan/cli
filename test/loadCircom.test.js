import {deepStrictEqual, strictEqual, ok} from 'node:assert';

import loadCircom from '../src/loadCircom.js';

describe('loadCircom', function() {
  it('should load circomkit.json includes from same dir', function() {
    const file = 'test/circuits/circomkit/mainB.circom';
    const loaded = loadCircom(file);
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
    const file = 'test/circuits/circomkit/src/mainA.circom';
    const loaded = loadCircom(file);
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
    const file = 'test/circuits/circomkit/src/mainC.circom';
    let hadError;
    try {
      const loaded = loadCircom(file);
    } catch(error) {
      hadError = true;
      ok(error.message.startsWith('NOT_FOUND'));
    }
    ok(hadError);
  });

  it('should load from circomlib without circomkit.json', function() {
    const file = 'test/circuits/vanilla/src/mainC.circom';
    const loaded = loadCircom(file);
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
