require('dotenv').config();
const axios = require('axios');
const debug = require('debug')('flickrdownloader');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const Flickr = require('flickrapi');

const downloadPath = process.env.DOWNLOAD_PATH;
const userId = process.env.USER_ID;
const perPage = process.argv[2];
const page = process.argv[3];
const baseOpts = { user_id: userId, authenticated: true };

const flickrOptions = {
  api_key: process.env.API_KEY,
  secret: process.env.API_SECRET,
  user_id: userId,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
};

async function download(url, albumPath) {
  return new Promise(async (resolve, reject) => {
    try {
      debug(`Downloading ${url} to ${albumPath}`);
      const response = await axios({
        url,
        responseType: 'stream',
        timeout: 20000,
      });
      let filename = path.basename(url);
      if (response.headers['content-disposition']) {
        [, filename] = response.headers['content-disposition'].split('=');
      }
      response.data.pipe(fs.createWriteStream(`${albumPath}/${filename}`));
      response.data.on('end', () => resolve());
      response.data.on('error', err => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

async function downloadPhoto(flickr, photo, albumPath) {
  return new Promise((resolve, reject) => {
    flickr.photos.getSizes(
      { ...baseOpts, photo_id: photo.id },
      async (err, sizes) => {
        let videoOriginal;
        let siteMP4;
        let original;

        try {
          if (err) { throw err; }
          videoOriginal = sizes.sizes.size.find(size => size.label === 'Video Original');
          siteMP4 = sizes.sizes.size.find(size => size.label === 'Site MP4');
          original = sizes.sizes.size.find(size => size.label === 'Original');

          if (videoOriginal) {
            await download(videoOriginal.source, albumPath);
          } else {
            await download(original.source, albumPath);
          }
          return resolve();
        } catch (downloadErr) {
          if (videoOriginal && downloadErr.response.status === 404) {
            try {
              await download(siteMP4.source, albumPath);
              return resolve();
            } catch (videoRetryErr) {
              return reject(videoRetryErr);
            }
          }
          return reject(downloadErr);
        }
      },
    );
  });
}

function getPhotosets(flickr) {
  return new Promise((resolve, reject) => {
    flickr.photosets.getList({ ...baseOpts, page, per_page: perPage }, (err, result) => {
      if (err) { return reject(err); }
      return resolve(result.photosets.photoset);
    });
  });
}

// TODO: handle multiple pages
function getPhotosForSet(flickr, photoset) {
  return new Promise((resolve, reject) => {
    flickr.photosets.getPhotos(
      { ...baseOpts, page: 2, photoset_id: photoset.id },
      (err, result) => {
        if (err) { return reject(err); }
        return resolve(result.photoset.photo);
      },
    );
  });
}

async function downloadSet(flickr, photoset) {
  const photos = await getPhotosForSet(flickr, photoset);
  const albumPath = `${downloadPath}/${photoset.title._content}`;
  mkdirp.sync(albumPath);
  for (const photo of photos) { // eslint-disable-line
    await downloadPhoto(flickr, photo, albumPath);
  }
  console.log(`${photos.length}/${photoset.photos} photos downloaded for album '${photoset.title._content}'`);
}

function run() {
  return new Promise((resolve, reject) => {
    Flickr.authenticate(flickrOptions, async (authErr, flickr) => {
      try {
        if (authErr) { throw authErr; }
        const photosets = await getPhotosets(flickr);
        for (const photoset of photosets) { // eslint-disable-line
          await downloadSet(flickr, photoset);
        }
      } catch (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

run().then(() => {
  console.log('Complete');
  process.exit();
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
