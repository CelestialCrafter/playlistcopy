const SpotifyWebApi = require('spotify-web-api-node');
const app = require('express')();
const open = require('open');
const crypto = require('crypto');
const {
	writeFileSync, readFileSync, existsSync, mkdirSync
} = require('fs');
const { join, resolve } = require('path');
const options = require('./config.js');
const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/;

const spotifyApi = new SpotifyWebApi({
	redirectUri: 'http://localhost:52752/',
	clientId: options.clientId,
	clientSecret: options.clientSecret
});

const dataPath = resolve('data/');
const credentialPath = join(dataPath, 'spotifyCredentials.txt');

const getUserCredentials = () => {
	const listener = app.listen(52752, () => console.log('Listening for spotify auth on port 52752'));

	app.get('/', (req, res) => {
		res.sendFile(join(__dirname, 'auth.html'));
		if (!req.query.code) return console.error('No Auth Code');
		spotifyApi
			.authorizationCodeGrant(req.query.code)
			.then((data) => {
				spotifyApi.setAccessToken(data.body.access_token);
				spotifyApi.setRefreshToken(data.body.refresh_token);
				try {
					writeFileSync(credentialPath, data.body.refresh_token);
				} catch (err) {
					console.erorr(err);
				}
				listener.close();
				console.log('Spotify has been authorized');
				spotify();
			})
			.catch(err => console.error(err));
	});

	const authUrl = spotifyApi.createAuthorizeURL(
		['playlist-modify-public', 'playlist-modify-private'],
		crypto.randomBytes(16).toString('hex')
	);
	open(authUrl);
};

const authorizeSpotify = () => {
	if (existsSync(credentialPath)) {
		spotifyApi.setRefreshToken(readFileSync(credentialPath));
		spotifyApi
			.refreshAccessToken()
			.then((data) => {
				spotifyApi.setAccessToken(data.body.access_token);
				console.log('Spotify has been authorized');
				spotify();
			})
			.catch((err) => {
				console.error(err);
				console.log('Requesting user authentication');
				getUserCredentials();
			});
	} else {
		if (!existsSync(dataPath)) mkdirSync(dataPath);
		console.warn('Refresh token file does not exist');
		console.log('Requesting user authentication');
		getUserCredentials();
	}
};

const spotify = () => {
	let fromPlaylist = process.argv[2];
	let toPlaylist = process.argv[3];

	if (urlRegex.test(fromPlaylist)) {
		const pathname = new URL(fromPlaylist).pathname;
		fromPlaylist = pathname.split('/')[2];
	}

	if (urlRegex.test(toPlaylist)) {
		const pathname = new URL(toPlaylist).pathname;
		toPlaylist = pathname.split('/')[2];
	}

	if (!fromPlaylist || !toPlaylist) return console.error('From and to playlist needed.');

	spotifyApi.getPlaylistTracks(fromPlaylist)
		.then(data => data.body.items.map(t => t.track.uri))
		.then(data => spotifyApi.addTracksToPlaylist(toPlaylist, data))
		.then(() => console.log('Songs added to playlist!'));
};

authorizeSpotify();