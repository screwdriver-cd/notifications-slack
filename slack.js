'use strict';

const { WebClient } = require('@slack/client');

let web;

/**
 * Post message to a specific channel
 * @method postMessage
 * @param {String} channelName      name of the channel
 * @param {Object} payload          payload of the slack message
 * @return {Promise}
 */
function postMessage(channelName, payload) {
    // Can post to channel name directly https://api.slack.com/methods/chat.postMessage#channels
    return web.chat.postMessage({
        channel: channelName,
        text: payload.message,
        as_user: true,
        attachments: payload.attachments
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
        web = new WebClient(token, {
            retryConfig: {
                retries: 5,
                factor: 3.86,
                maxRetryTime: 30 * 60 * 1000 // Set maximum time to 30 min that the retried operation is allowed to run
            }
        });
    }

    return Promise.all(channels.map(channelName => postMessage(channelName, payload)));
}

module.exports = slacker;
