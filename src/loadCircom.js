import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {findClosestFile} from './utils.js';

export default function(file) {
  const circomkit = findClosestFile(dirname(file), 'circomkit.json');
  if(circomkit) {
    let extraLocations = [];
    const config = JSON.parse(readFileSync(circomkit, {encoding:'utf-8'}));
    if('include' in config && Array.isArray(config.include)) {
      extraLocations = [...extraLocations, ...config.include];
    }
    return loadCircomSources(file, dirname(circomkit), extraLocations);
  } else {
    return loadCircomSources(file, dirname(file), []);
  }
}

function loadCircomSources(fileName, rootDir, extraLocations, parentFile, out) {
  out = out || {};
  const thisDir = dirname(fileName);
  const parentDir = parentFile && dirname(parentFile);
  let tryIndex = 0;
  const tried = [];
  let tryFile = parentDir ? join(parentDir, fileName) : fileName;
  let circomCode;
  while(!circomCode) {
    tried.push(tryFile);
    if(tryFile in out) {
      return out[tryFile];
    }
    try {
      circomCode = readFileSync(tryFile, {encoding: 'utf8'});
    } catch(error) {
      if(error.code === 'ENOENT') {
        tryIndex++;
        if(tryIndex === 1) {
          tryFile = join(rootDir, fileName);
        } else if(tryIndex === 2) {
          tryFile = join(rootDir, 'node_modules', fileName);
        } else if(tryIndex === 3) {
          tryFile = join(rootDir, 'node_modules', 'circomlib', 'circuits', fileName);
        } else if(tryIndex < extraLocations.length + 4) {
          tryFile = resolve(join(rootDir, extraLocations[tryIndex - 4], fileName));
        } else {
          throw new Error(`NOT_FOUND

${fileName}${parentFile ? ' from ' + parentFile : ''}

Tried:
  ${tried.join('\n  ')}
${extraLocations.length ? `Extra Locations from circomkit.json:
  ${extraLocations.join('\n  ')}
` : `

Consider creating a circomkit.json file to specify more search locations.
`}
`);
        }
      } else throw error;
    }
  }
  const imported = getImports(circomCode);
  const mainComponent = parseMainComponent(circomCode);
  out[tryFile] = {
    fileName,
    file: tryFile,
    circomCode,
    mainComponent,
  };
  const loadedImports = imported.map(importFile =>
    loadCircomSources(importFile, rootDir, extraLocations, tryFile, out));
  Object.assign(out[tryFile], {
    imports: loadedImports.reduce((thisOut, importSource) => {
      thisOut[importSource.fileName] = importSource.file;
      return thisOut;
    }, {}),
  });
  // Top level
  if(!parentFile) return out;
  // Somewhere else
  return out[tryFile];
}

function getImports(circomCode) {
  return Array.from(circomCode.matchAll(/include "([^"]+)";/g)).map(x=>x[1]);
}

function parseMainComponent(code) {
    const regex = /component\s+main\s*(\{\s*public\s*\[\s*([^\]]*)\s*\]\s*\})?\s*=\s*([a-zA-Z0-9_]+)\(([^)]*)\);/;
    const match = code.match(regex);

    if (!match) {
        return null;
    }

    const publicSignals = match[2] ? match[2].split(',').map(signal => signal.trim()) : [];
    const templateName = match[3];
    const args = match[4] ? match[4].split(',').map(arg => arg.trim()) : [];

    return {
        publicSignals,
        templateName,
        args,
        full: match[0],
    };
}
