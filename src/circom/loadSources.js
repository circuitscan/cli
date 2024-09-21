import {readFileSync} from 'node:fs';
import {dirname, basename, join, resolve} from 'node:path';

import {findClosestFile} from '../utils.js';

export default function(file) {
  // Convert relative filename argument to full path
  file = resolve(file);
  const circomkit = findClosestFile(dirname(file), 'circomkit.json');
  if(circomkit) {
    let extraLocations = [];
    let config;
    try {
      config = JSON.parse(readFileSync(circomkit, {encoding:'utf-8'}));
    } catch(error) {
      throw new Error('INVALID_JSON: ' + circomkit);
    }
    if('include' in config && Array.isArray(config.include)) {
      extraLocations = [...extraLocations, ...config.include];
    }
    return {
      circomkit: config,
      files: loadCircomSources(file, dirname(circomkit), extraLocations),
    };
  } else {
    return {
      files: loadCircomSources(file, dirname(file), []),
    };
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
        if(tryIndex < extraLocations.length) {
          tryFile = resolve(join(rootDir, extraLocations[tryIndex], fileName));
        } else if(tryIndex === extraLocations.length) {
          tryFile = join(rootDir, fileName);
        } else if(tryIndex === extraLocations.length + 1) {
          tryFile = join(rootDir, 'node_modules', fileName);
        } else if(tryIndex === extraLocations.length + 2) {
          tryFile = join(rootDir, 'node_modules', 'circomlib', 'circuits', fileName);
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
        tryIndex++;
      } else throw error;
    }
  }
  const remainingCode = removeComments(circomCode);
  const imported = getImports(remainingCode);
  const mainComponent = parseMainComponent(remainingCode);
  out[tryFile] = {
    fileName,
    file: tryFile,
    circomCode,
    mainComponent,
  };
  const loadedImports = imported.map(importFile =>
    loadCircomSources(importFile, rootDir, extraLocations, tryFile, out));
  Object.assign(out[tryFile], {
    imports: loadedImports.reduce((thisOut, importSource, index) => {
      thisOut[imported[index]] = importSource.file;
      return thisOut;
    }, {}),
  });
  // Top level
  if(!parentFile) return shortenFilenames(out);
  // Somewhere else
  return out[tryFile];
}

function shortenFilenames(out) {
  const keys = Object.keys(out);
  if(keys.length === 0) return out;
  else if(keys.length === 1) return {
    [basename(keys[0])]: out[keys[0]],
  };
  const prefix = longestCommonPrefix(keys);
  for(let key of keys) {
    // Update each item's imports
    const imports = Object.keys(out[key].imports);
    for(let thisImport of imports) {
      out[key].imports[thisImport] = out[key].imports[thisImport].slice(prefix.length);
    }

    // Update the item itself
    out[key.slice(prefix.length)] = out[key];
    delete out[key];
  }
  return out;
}

function longestCommonPrefix(strs) {
    if (strs.length === 0) return "";
    let prefix = strs[0];

    for (let i = 1; i < strs.length; i++) {
        while (strs[i].indexOf(prefix) !== 0) {
            prefix = prefix.substring(0, prefix.length - 1);
            if (prefix === "") return "";
        }
    }

    return prefix;
}

function removeComments(source) {
  // Regular expression to match single-line and multi-line comments
  const regex = /\/\/.*|\/\*[\s\S]*?\*\//g;
  // Replace comments with an empty string
  return source.replace(regex, '');
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
