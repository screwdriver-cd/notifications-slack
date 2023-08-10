'use strict';

const { WebClient } = require('@slack/web-api');
const logger = require('screwdriver-logger');
const webClients = {};

/**
 * Parse slack config
 * @method parseSlackConfig
 * @param {Object}      config                  slack config
 * @param {String}      config.defaultWorkspace default slack workspace
 * @param {Object}      config.workspaces       slack workspaces config
 * @param {String}      channelConfig           slack channel name (ex. channel1, workspace1:channel2)
 * @return {Object}
 */
function parseSlackConfig(config, channelConfig) {
    let workspace = config.defaultWorkspace;
    let channel = channelConfig;

    if (channel.includes(':')) {
        [workspace, channel] = channel.split(':');
    }

    const workspaceConfig = config.workspaces[workspace];

    if (!workspaceConfig) {
        logger.error(`Cannot find slack token of ${workspace}.`);

        return {};
    }

    return { workspace, channel, token: workspaceConfig.token };
}

/**
 * Post message to a specific channel
 * @method postMessage
 * @param {String} channel          name of the channel
 * @param {Object} web              slack web client
 * @param {Object} payload          payload of the slack message
 * @return {Promise}
 */
function postMessage(channel, web, payload) {
    // Can post to channel name directly https://api.slack.com/methods/chat.postMessage#channels
    return web.chat
        .postMessage({
            channel,
            text: payload.message,
            as_user: true,
            attachments: payload.attachments
        })
        .catch(err => logger.error(`postMessage: failed to notify Slack channel ${channel}: ${err.message}`));
}

/**
 * Sends slack message to slack channels
 * @param {Object}      config                  slack config
 * @param {String}      config.defaultWorkspace default slack workspace
 * @param {Object}      config.workspaces       slack workspaces config
 * @param {String[]}    channels                slack channel names
 * @param {Object}      payload                 slack message payload
 * @return {Promise}
 */
function slacker(config, channels, payload) {
    return Promise.all(
        channels.map(channelConfig => {
            const { workspace, channel, token } = parseSlackConfig(config, channelConfig);

            if (!workspace || !token) {
                return Promise.resolve();
            }

            if (!webClients[workspace]) {
                webClients[workspace] = new WebClient(token, {
                    retryConfig: {
                        retries: 5,
                        factor: 3.86,
                        maxRetryTime: 30 * 60 * 1000 // Set maximum time to 30 min that the retried operation is allowed to run
                    }
                });
            }

            const web = webClients[workspace];

            return postMessage(channel, web, payload);
        })
    );
}

module.exports = slacker;
