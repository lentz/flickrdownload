# flickrdownload
Node module that downloads albums from a Flickr account

## Installation
`npm install flickrdownload`

## Usage
If you don't already have one, request a Flickr API key and secret from
https://www.flickr.com/services/apps/create/noncommercial/.

Rename `.env.example` to `.env` and enter the API key and secret issued to you
by Flickr. Enter the download path where you would like your photos saved
locally. Remove the `USER_ID`, `ACCESS_TOKEN` and `ACCESS_SECRET` values from
`.env` and run `./node_modules/.bin/flickrdownload`. This will perform the
initial authentication with Flickr and print these values to the command line.
Once you have them, add back `USER_ID`, `ACCESS_TOKEN` and `ACCESS_SECRET` to
`.env`.

You can now begin downloading your photosets (albums) by running
`./node_modules/.bin/flickrdownload --per-page 8 --page 1`.
These options refer to which albums you'd like to download.
The albums are sorted according to the Flickr account's settings.
Each album will be downloaded to it's own folder in `DOWNLOAD_PATH`.
Both photos and videos are supported.

## Debugging
flickrdownload uses the debug module to support verbose debugging output
while running. To enable, add an environment variable called `DEBUG` with a
value of `flickrdownload` when running:
`DEBUG=flickrdownload ./node_modules/.bin/flickrdownload --page 1 --per-page 8`
