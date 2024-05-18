import loadCircom from './src/loadCircom.js';

export async function verify(file, chainId, contractAddr) {
  const loaded = loadCircom(file);
  console.log(loaded[file]);
}
