const fsHelper = require('./fs-helper');

exports.validate = validate;

function validate(dir) {
    return new Promise((resolve, reject) => {
        if (!process.argv[2]) {
            reject(new Error('No directory was specified.'));
        } else {
            fsHelper.isDir(dir).then((isDir) => {
                if (isDir) {
                    resolve();
                } else {
                    reject(new Error('The provided path is not a valid directory.'));
                }
            }).catch(reject);
        }
    });
}
