import {log} from "../index";
const ffmpeg = require('fluent-ffmpeg/lib/fluent-ffmpeg');

export function encodeMP3(root, files, opts) {
    return new Promise((resolve, reject) => {
        let doneCount = 0;
        // clone file list to avoid increasing loop size
        files = Object.assign([], files);
        // iterate over files and convert each to mp3 format
        files.forEach((file) => {
            try {
                const fullPath = root + '/' + file;
                ffmpeg()
                    .input(fullPath)
                    .audioCodec('libmp3lame')
                    .audioBitrate(opts.bitrate)
                    // save the file as <the original file>.mp3
                    .save(`${fullPath}.mp3`)
                    // log messages for start and end
                    .on('start', () => {
                        log(`starting ${file}...`);
                    })
                    // resolve the promise when all of the files have finished converting
                    .on('end', () => {
                        log(`${file}.mp3 done`, 'success');
                        doneCount += 1;
                        if (doneCount === files.length) {
                            resolve();
                        }
                    });
            } catch (e) {
                reject(e);
            }
        });
    });
}