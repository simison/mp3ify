import {firstArgIsFile, firstArgIsDirectory} from "./helpers/arg.helper";

main().catch((e) => {
    printErr(e);
    process.exit(1);
});

function main() {
    return new Promise((resolve, reject) => {
        validateArgs().then(() => {
        }).catch(reject);
    });
}

/**
 * validate arguments to ensure a valid directory or path to a file have been passed as the second
 * argument
 * @returns {Promise}
 */
function validateArgs() {
    return new Promise((resolve, reject) => {
        firstArgIsFile().then((isFile) => {
            if (isFile) {
                resolve(true);
            } else {
                firstArgIsDirectory().then((isDirectory) => {
                    if (isDirectory) {
                        resolve(true);
                    }
                }).catch(reject);
            }
        }).catch(reject);
    });
}

function printErr(err) {
    const chalk = require('chalk');
    console.log(chalk.red(err));
}

/*

const ffmpeg = require('fluent-ffmpeg');
const chalk = require('chalk');
const argHelper = require('././arg-helper');
const fsHelper = require('././fs-helper');

main();

function main() {
    const dir = `${process.cwd()}/${process.argv[2]}`;
    const opts = getOpts(require('minimist')(process.argv.slice(3)));
    exec(dir, opts).then(() => {
        console.log(chalk.blue('All files successfully converted.'));
    }).catch(err => {
        printErr(err);
        process.exit(1);
    });
}

function exec(dir, opts) {
    return new Promise((resolve, reject) => {
        argHelper.validate(dir).then(() => {
            fsHelper.filesInDirOfType(dir, 'audio', 'mp3').then((files) => {
                let doneCount = 0;
                // clone file list to avoid increasing loop size
                files = Object.assign([], files);
                files.forEach((file) => {
                    try {
                        const fullPath = dir + '/' + file;
                        ffmpeg()
                            .input(fullPath)
                            .audioCodec('libmp3lame')
                            .audioBitrate(opts.bitrate)
                            .save(`${fullPath}.mp3`)
                            .on('start', () => {
                                console.log(chalk.grey(`starting ${file}...`));
                            })
                            .on('end', () => {
                                console.log(chalk.green(`${file}.mp3 done`));
                                doneCount += 1;
                                if (doneCount === files.length) {
                                    resolve();
                                }
                            });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).catch(() => {
                reject('An error occurred while reading the provided directory.');
            });
        }).catch(reject);
    });
}

function getOpts(args) {
    return {
        bitrate: getBitrate(args)
    }
}

function getBitrate(args) {
    if (args.bitrate && !isNaN(parseInt(args.bitrate))) {
        return parseInt(args.bitrate);
    } else {
        // encode at 320kbps by default
        return 320;
    }
}

function printErr(err) {
    console.log(chalk.red(err));
}
*/
