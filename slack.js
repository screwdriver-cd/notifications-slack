'use strict';

const hoek = require('hoek');
const { WebClient } = require('@slack/client');

let web;

/**
 * Retrieves the channel id
 * @param {String} channelName             slack channel name
 * @return {Promise}                       the channel id
 */
function getChannelId(channelName) {
    const config = {
        exclude_archived: true,
        exclude_members: true
    };

    return web.channels.list(config)
        .then(res => hoek.reach(res.channels.find(c => c.name === channelName), 'id'));
}

/**
 * Post message to a specific channel
 * @method postMessage
 * @param {String} channelName      name of the channel
 * @param {Object} payload          payload of the slack message
 * @return {Promise}
 */
function postMessage(channelName, payload) {
    return getChannelId(channelName)
        .then((id) => {
            if (!id) {
                // eslint-disable-next-line no-console
                throw new Error(`Channel ID not found for: ${channelName}`);
            }

            return web.chat.postMessage({
                channel: id,
                text: payload.message,
                as_user: true,
                attachments: payload.attachments
            });
        })
        // eslint-disable-next-line no-console
        .catch(err => console.error(err.message));
}

/**
 * Sends slack message to slack channels
 * @param {String} token                   access token for slack
 * @param {String[]} channels              slack channel names
 * @param {Object} payload
 * @return {Promise}
 */
function slacker(token, channels, payload) {
    if (!web) {
        web = new WebClient(token);
    }

    return Promise.all(channels.map(channelName => postMessage(channelName, payload)));
}

module.exports = slacker;
