# mp3ify
Transcode audio files to mp3 format. Simple as that. Works with a single file or a directory.

## Prerequisites
You must have 
<a href="https://ffmpeg.org/">ffmpeg</a>
installed on your machine.

### Mac OS X
Brew is the simplest way to install ffmpeg
```shell
brew install ffmpeg
```

### Windows/Ubuntu
See the guide 
<a href="https://github.com/adaptlearning/adapt_authoring/wiki/Installing-FFmpeg">
here
</a>

## Installation
```shell
npm install -g mp3ify
```

## Usage

```shell
mp3ify <file | directory> --<options>
```

You may pass either a file or directory to the program. 
Conversion will be attempted on any files detected with an `audio/*` mime type.

Files will be saved in the calling 
directory and will have the same name as the original file with `.mp3` appended.

If you are using npm >= 5.2, then you can use [npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) without installing mp3ify globally:
 
 ```shell
 npx mp3ify <file | directory> --<options>
 ```
 
#### options
* `--bitrate` - the bitrate of the generated mp3 file in kb/s. default: 320
* `--quiet` - suppress console output during encoding, exit with code 0 even if there is an exception. default: false

For example, say there is a directory named `wav-files` on your home path full of .wavs that you need to convert to mp3:

```shell
mp3ify ~/wav-files --bitrate 320
```

That will convert any file that is detected to have a mime type of `audio/*`.

## Build
The code is written in ES6 and compiled down to ES5 using webpack. To compile all project files into
`bin/index.js`, run the following:

```shell
npm test
npm run build
```

## Contributing
I will gladly accept contributions to this project. Fork the repo and issue a pull request if you'd like to see new 
features or fix bugs.
