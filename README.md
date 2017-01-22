## Usage

```shell
mp3ify <file | directory> --options
```
You may pass either a file or directory to the program. 
Conversion will be attempted on any files detected with an `audio/*` mime type.

Files will be saved in the calling 
directory and will have the same name as the original file with `.mp3` appended.

#### options
* `--bitrate` - the bitrate of the generated mp3 file