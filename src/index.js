import {parseOptsWithDefaults} from "./helpers/arg.helper";
import {isFile, isDirectory, filesOfType} from "./helpers/fs.helper";
import {encodeMP3} from "./helpers/ffmpeg.helper";

const options = parseOptsWithDefaults(require('minimist')(process.argv.slice(3)));

// TODO handle converting mp3 files. currently the file will be truncated
// TODO write tests

main().catch((e) => {
    printErr(e);
    process.exit(options.quiet ? 0 : 1);
});

/**
 * starting point for CLI
 * @returns {Promise}
 */
function main() {
    const path = process.argv[2];

    return new Promise((resolve, reject) => {
        validateArgs(path).then(() => {
            filesOfType(path, 'audio').then((files) => {
                if (files.length) {
                    log(`Converting ${files.length} files to mp3 at ${options.bitrate} kbps...`, 'info');
                    encodeMP3(process.cwd(), files, options).then(() => {
                        log('All files successfully converted.', 'info');
                    }).catch(reject);
                } else {
                    log('No files found for conversion.', 'info');
                }
            });
        }).catch(reject);
    });
}

/**
 * validate arguments to ensure a valid directory or path to a file have been passed as the second
 * argument
 * @returns {Promise}
 */
function validateArgs(path) {
    return new Promise((resolve, reject) => {
        isFile(path).then((isFile) => {
            if (isFile) {
                resolve(true);
            } else {
                isDirectory(path).then((isDirectory) => {
                    if (isDirectory) {
                        resolve(true);
                    } else {
                        reject(new Error('Supplied path is not a file nor directory.'));
                    }
                }).catch(reject);
            }
        }).catch(reject);
    });
}

export function log(msg, type) {
    const chalk = require('chalk');
    switch (type) {
        case 'error':
            msg = chalk.red(msg);
            break;
        case 'info':
            msg = chalk.blue(msg);
            break;
        case 'success':
            msg = chalk.green(msg);
            break;
        default:
            msg = chalk.grey(msg);
            break;
    }
    if (!options.quiet) {
        console.log(msg);
    }
}

function printErr(err) {
    log(err, 'error');
}

