import loadCircom from './src/loadCircom.js';

const files = [
  '../zk-p2p/circuits-circom/circuits/venmo/venmo_send.circom',
  '../semaphore/packages/circuits/src/main/semaphore.circom',
  '/home/ben/Downloads/source/tmp/multiplier-rubber-azure-dinosaur/circuits/test/verify_circuit.circom',
  '/home/ben/zkp2p-venmo-send/circuit.circom',
  'test/circuits/circomkit/src/mainC.circom',
  'test/circuits/vanilla/src/mainC.circom',
  'test/circuits/vanilla/mainB.circom',
];
const loaded = loadCircom(files[4]);
console.log(loaded[Object.keys(loaded)[0]]);
console.log(JSON.stringify(loaded).length);
