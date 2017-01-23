const fs = require('fs');
const mime = require('mime');

/**
 * return a promise that resolves a boolean to determine if the given path is a file
 * @param path
 * @returns {Promise}
 */
export function isFile(path) {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isFile());
            }
        });
    });
}

/**
 * return a promise that resolves a boolean to determine if the given path is a directory
 * @param path
 * @returns {Promise}
 */
export function isDirectory(path) {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isDirectory());
            }
        });
    });
}

/**
 * given a path to a file or directory, return an array that includes all of the files that match
 * the given mimeType
 * @param path
 * @param mimeType
 * @returns {Promise}
 */
export function filesOfType(path, mimeType) {
    return new Promise((resolve, reject) => {
        // check if the path is a file and resolve an array with just the file if it matches the mimeType
        isFile(path).then((pathIsFile) => {
            if (pathIsFile) {
                const files = [path];
                resolve(filterOnMimeType(files));
            } else {
                // read directory and filter down files that match the mimeType
                readDir(path).then((files) => {
                    resolve(filterOnMimeType(files));
                }).catch(reject);
            }
        }).catch(reject);

        function filterOnMimeType(files) {
            return files.filter(file => {
                return mime.lookup(file).indexOf(mimeType) > -1 && !(new RegExp('.mp3' + '$').test(file));
            });
        }
    });
}

/**
 * return a Promise that resolves an array of all of the files in a given directory
 * @param dir
 * @returns {Promise}
 */
export function readDir(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}
