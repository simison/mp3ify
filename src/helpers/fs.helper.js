const _fs = require('fs');

export function isFile(path) {
    return new Promise((resolve, reject) => {
        _fs.stat(path, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isFile());
            }
        });
    });
}

export function isDirectory(path) {
    return new Promise((resolve, reject) => {
        _fs.stat(path, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isDirectory());
            }
        });
    });
}