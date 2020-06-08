#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const program = require('commander');
const debug = require('debug')('flickrdownloader');
const fs = require('fs');
const glob = require('glob');
const { mkdirSync } = require('fs');
const path = require('path');
const Flickr = require('flickrapi');

program
  .name('flickrdownload')
  .description('Download albums from a Flickr account')
  .version('1.0.0')
  .option('--per-page <n>', 'Number of albums to download at once', parseInt)
  .option('--page <n>', 'Page of albums to download', parseInt)
  .parse(process.argv);

const downloadPath = process.env.DOWNLOAD_PATH;
const userId = process.env.USER_ID;
const { perPage, page } = program;
const baseOpts = { user_id: userId, authenticated: true };

const flickrOptions = {
  api_key: process.env.API_KEY,
  secret: process.env.API_SECRET,
  user_id: userId,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
};

async function downloadUrl(url, albumPath) {
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

  response.data.pipe(fs.createWriteStream(path.join(albumPath, filename)));
  return new Promise((resolve, reject) => {
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });
}

async function downloadPhoto(flickr, photo, albumPath) {
  return new Promise((resolve, reject) => {
    if (glob.sync(path.join(albumPath, `${photo.id}*`)).length) {
      debug(`Photo ID ${photo.id} already exists`);
      return resolve();
    }
    return flickr.photos.getSizes(
      { ...baseOpts, photo_id: photo.id },
      async (err, sizes) => {
        let videoOriginal;
        let siteMP4;
        let original;

        try {
          if (err) {
            throw err;
          }
          videoOriginal = sizes.sizes.size.find(
            (size) => size.label === 'Video Original',
          );
          siteMP4 = sizes.sizes.size.find((size) => size.label === 'Site MP4');
          original = sizes.sizes.size.find((size) => size.label === 'Original');

          if (videoOriginal) {
            await downloadUrl(videoOriginal.source, albumPath);
          } else {
            await downloadUrl(original.source, albumPath);
          }
          return resolve();
        } catch (downloadErr) {
          if (videoOriginal && downloadErr.response.status === 404) {
            try {
              await downloadUrl(siteMP4.source, albumPath);
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
    flickr.photosets.getList(
      { ...baseOpts, page, per_page: perPage },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result.photosets.photoset);
      },
    );
  });
}

function getPhotosForSet(flickr, photoset, photoPage = 1) {
  return new Promise((resolve, reject) => {
    flickr.photosets.getPhotos(
      { ...baseOpts, page: photoPage, photoset_id: photoset.id },
      async (flickrErr, result) => {
        try {
          if (flickrErr) {
            throw flickrErr;
          }
          if (photoPage < result.photoset.pages) {
            const nextPage = await getPhotosForSet(
              flickr,
              photoset,
              photoPage + 1,
            );
            return resolve([...result.photoset.photo, ...nextPage]);
          }
          return resolve(result.photoset.photo);
        } catch (err) {
          return reject(err);
        }
      },
    );
  });
}

async function downloadSet(flickr, photoset) {
  console.log(`Getting photos in '${photoset.title._content}'`);
  const photos = await getPhotosForSet(flickr, photoset);
  const albumPath = `${downloadPath}/${photoset.title._content}`;
  mkdirSync(albumPath, { recursive: true });
  // eslint-disable-next-line no-restricted-syntax
  for (const [index, photo] of photos.entries()) {
    await downloadPhoto(flickr, photo, albumPath);
    process.stdout.write(
      `Downloaded ${index + 1}/${photos.length} photos from '${
        photoset.title._content
      }'\r`,
    );
  }
}

Flickr.authenticate(flickrOptions, async (authErr, flickr) => {
  try {
    if (authErr) {
      throw authErr;
    }
    const photosets = await getPhotosets(flickr);
    // eslint-disable-next-line no-restricted-syntax
    for (const photoset of photosets) {
      await downloadSet(flickr, photoset);
    }
  } catch (err) {
    console.error(`\n${err.stack}`);
    return process.exit(1);
  }
  console.log('\nDownloading complete!');
  return process.exit();
});
