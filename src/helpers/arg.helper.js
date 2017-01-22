import {isFile, isDirectory} from "./fs.helper";
const args = require('minimist')(process.argv.slice(2));

export function firstArgIsFile() {
    const fullPath = `${process.cwd()}/${process.argv[2]}`;
    return isFile(fullPath);
}

export function firstArgIsDirectory() {
    const fullPath = `${process.cwd()}/${process.argv[2]}`;
    return isDirectory(fullPath);
}