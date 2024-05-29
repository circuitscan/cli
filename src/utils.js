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
