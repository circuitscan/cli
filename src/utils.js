import {accessSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

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
  16: 'r7i.large',
  32: 'r7i.xlarge',
  64: 'r7i.2xlarge',
  128: 'r7i.4xlarge',
  256: 'r7i.8xlarge',
  384: 'r7i.12xlarge',
  1536: 'r7i.16xlarge',
}
