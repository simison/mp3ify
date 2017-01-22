const fs = require('fs');
const _mime = require('mime');

exports.readDir = readDir;
exports.isDir = isDir;
exports.filesInDir = filesInDir;
exports.filesInDirOfType = filesInDirOfType;

function isDir(dir) {
    return new Promise((resolve, reject) => {
        fs.stat(dir, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats.isDirectory());
            }
        });
    });
}

function readDir(dir) {
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

function filesInDir(dir) {
    return new Promise((resolve, reject) => {
        const files = [];
        readDir(dir).then((_files) => {
            _files.forEach((file, index) => {
                isDir(file).then((isDirectory) => {
                    if (!isDirectory) {
                        files.push(file);
                    }
                    if (index === _files.length - 1) {
                        resolve(files);
                    }
                });
            });
        }).catch(reject);
    });
}

function filesInDirOfType(dir, mime, ext) {
    return new Promise((resolve, reject) => {
        filesInDir(dir).then((files) => {
            resolve(files.filter(file => {
                return _mime.lookup(file).indexOf(mime) > -1 && !(new RegExp(ext + '$').test(file));
            }));
        }).catch(reject);
    });
}

