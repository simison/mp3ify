#!/usr/bin/env node

const ffmpeg = require('fluent-ffmpeg');
const mime = require('mime');
const fs = require('fs');
const dir = process.argv[2];
const chalk = require('chalk');

fs.readdir(dir, (err, files) => {
    if (err) {
        process.exit(1);
    }
    // clone file list to avoid increasing loop size
    files = JSON.parse(JSON.stringify(files));
    files.forEach((file) => {
        if (mime.lookup(file).indexOf('audio') > -1 && !/.mp3$/.test(file)) {
            try {
                const fullPath = dir + '/' + file;
                ffmpeg()
                    .input(fullPath)
                    .audioCodec('libmp3lame')
                    .save(`${fullPath}.mp3`)
                    .on('start', () => {
                        console.log(chalk.grey(`starting ${file}...`));
                    })
                    .on('end', () => {
                        console.log(chalk.green(`${file}.mp3 done`));
                    });
            } catch (e) {
                console.log(e);
            }
        }
    });
});