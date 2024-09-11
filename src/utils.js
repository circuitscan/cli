import {accessSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {homedir} from 'node:os';

export const DEFAULT_CONFIG = 'https://circuitscan.org/cli.json';
export const MAX_POST_SIZE = 6 * 1024 ** 2; // 6 MB

export async function loadConfig(options) {
  options.instance = options.instance || '4';
  try {
    const response = await fetch(options.config || process.env.CIRCUITSCAN_CONFIG || DEFAULT_CONFIG);
    const data = await response.json();
    options.config = data;
  } catch(error) {
    throw new Error('INVALID_CONFIG_URL');
  }
  return options;
}

function loadUserConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.circuitscan'), 'utf8'));
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
}

export function activeApiKey(options) {
  if(options.apiKey) return options.apiKey;
  if(process.env.CIRCUITSCAN_API_KEY) return process.env.CIRCUITSCAN_API_KEY;
  const config = loadUserConfig() || {};
  return config.apiKey;
}

export function prepareProvingKey(input) {
  // Not specified
  if(!input) return undefined;
  // Externally hosted
  if(typeof input === 'string' && input.startsWith('https')) return input;
  const output = readFileSync(input).toString('base64');
  if(output.length > MAX_POST_SIZE)
    throw new Error(`Proving key too large for inline upload. (Max ${formatBytes(MAX_POST_SIZE)}) Host on https server instead.`);

  // Send inline
  return output;
}

export function getPackageJson() {
  return JSON.parse(readFileSync('./package.json', 'utf8'));
}

export function findClosestFile(dir, filename) {
    const fullPath = resolve(dir);  // Resolves the directory to an absolute path
    let currentDir = fullPath;

    while (true) {
        const candidate = join(currentDir, filename);

        // Check if the file exists in the current directory
        if (fileExists(candidate)) {
            return candidate;  // Return the path if the file is found
        }

        const parentDir = dirname(currentDir);

        // If the current directory is the root, stop the loop
        if (currentDir === parentDir) {
            break;
        }

        // Move to the parent directory
        currentDir = parentDir;
    }

    return null;  // Return null if the file is not found
}

function fileExists(filePath) {
    try {
        accessSync(filePath);  // Attempt to access the file
        return true;  // File exists
    } catch (error) {
        return false;  // File does not exist
    }
}

export function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

export async function fetchJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return data;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

export const instanceSizes = {
  4: 't3.medium',
  8: 't3.large',
  16: 'r7i.large',
  32: 'r7i.xlarge',
  64: 'r7i.2xlarge',
  128: 'r7i.4xlarge',
  256: 'r7i.8xlarge',
  384: 'r7i.12xlarge',
  512: 'r7i.16xlarge',
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    // ChatGPT predicts large circuits ahead!
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
