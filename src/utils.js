import {accessSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import { fetch, Agent } from 'undici';

import * as chains from 'viem/chains';

const agent = new Agent({ connectTimeout: 10000 });

export const DEFAULT_CONFIG = 'https://circuitscan.org/cli.json';
export const MAX_POST_SIZE = 6 * 1024 ** 2; // 6 MB

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadConfig(options) {
  options.instance = options.instance || '4';
  try {
    const response = await fetchWithRetry(options.config || process.env.CIRCUITSCAN_CONFIG || DEFAULT_CONFIG);
    const data = await response.json();
    options.config = data;
  } catch(error) {
    throw new Error('INVALID_CONFIG_URL');
  }
  return options;
}

export function getPackageJson() {
  return JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
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
  const response = await fetchWithRetry(url, {
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
  768: 'r7i.24xlarge',
  1536: 'r7i.48xlarge',
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

export function viemChain(nameOrId) {
  if(isNaN(nameOrId)) {
    return chains[nameOrId];
  }
  for(let chain in chains) {
    if(chain.id === Number(nameOrId)) return chain;
  }
}

export async function fetchWithRetry(url, options = {}, retries = 5, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, dispatcher: agent });
      return response;
    } catch (error) {
      const errorCode = error?.cause?.code;
      console.error(`Fetch attempt ${attempt + 1} failed:`, errorCode, error.message);

      const shouldRetry = errorCode === 'ETIMEDOUT' ||
                          errorCode === 'ENOTFOUND' ||
                          error.message.includes('fetch failed');

      if (!shouldRetry) throw error;

      if (attempt < retries - 1) {
        console.warn(`Retrying fetch (${attempt + 1}/${retries}) after error: ${errorCode}`);
        await new Promise(res => setTimeout(res, delay * Math.pow(2, attempt))); // Exponential backoff
      } else {
        throw new Error(`Fetch failed after ${retries} retries: ${error.message}`);
      }
    }
  }
}
