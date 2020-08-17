'use strict';

const Joi = require('joi');
const slacker = require('./slack');
const NotificationBase = require('screwdriver-notifications-base');
const hoek = require('hoek');

// This should match what is in https://github.com/screwdriver-cd/data-schema/blob/master/models/build.js#L98
// https://github.com/screwdriver-cd/ui/blob/master/app/styles/screwdriver-colors.scss
const COLOR_MAP = {
    ABORTED: 'danger',
    CREATED: '#0b548c', // Using 'sd-info-fg' from https://github.com/screwdriver-cd/ui/blob/master/app/styles/screwdriver-colors.scss
    FAILURE: 'danger',
    QUEUED: '#0F69FF',
    RUNNING: '#0F69FF',
    SUCCESS: 'good',
    BLOCKED: '#ccc', // Using 'sd-light-gray' from https://github.com/screwdriver-cd/ui/blob/master/app/styles/screwdriver-colors.scss
    UNSTABLE: '#ffd333', // Using 'sd-unstable' from https://github.com/screwdriver-cd/ui/blob/master/app/styles/screwdriver-colors.scss
    COLLAPSED: '#f2f2f2', // New color. Light grey.
    FIXED: 'good',
    FROZEN: '#acd9ff' // Using 'sd-frozen' from https://github.com/screwdriver-cd/ui/blob/master/app/styles/screwdriver-colors.scss
};
const STATUSES_MAP = {
    ABORTED: ':cloud:',
    CREATED: ':clock11:',
    FAILURE: ':umbrella:',
    QUEUED: ':cyclone:',
    RUNNING: ':runner:',
    SUCCESS: ':sunny:',
    BLOCKED: ':lock:',
    UNSTABLE: ':foggy:',
    COLLAPSED: ':arrow_up:',
    FIXED: ':sunny:',
    FROZEN: ':snowman:'
};
const DEFAULT_STATUSES = ['FAILURE'];
const SCHEMA_STATUS = Joi.string().valid(Object.keys(COLOR_MAP));
const SCHEMA_STATUSES = Joi.array()
    .items(SCHEMA_STATUS)
    .min(0);
const SCHEMA_SLACK_CHANNEL = Joi.string().required();
const SCHEMA_SLACK_CHANNELS = Joi.array()
    .items(SCHEMA_SLACK_CHANNEL)
    .min(1);
const SCHEMA_SLACK_SETTINGS = Joi.object().keys({
    slack: Joi.alternatives().try(
        Joi.object().keys({
            channels: SCHEMA_SLACK_CHANNELS,
            statuses: SCHEMA_STATUSES,
            minimized: Joi.boolean()
        }),
        SCHEMA_SLACK_CHANNELS, SCHEMA_SLACK_CHANNEL
    ).required()
}).unknown(true);
const SCHEMA_SCM_REPO = Joi.object()
    .keys({
        name: Joi.string().required()
    }).unknown(true);
const SCHEMA_PIPELINE_DATA = Joi.object()
    .keys({
        scmRepo: SCHEMA_SCM_REPO.required()
    }).unknown(true);
const SCHEMA_BUILD_DATA = Joi.object()
    .keys({
        settings: SCHEMA_SLACK_SETTINGS.required(),
        status: SCHEMA_STATUS.required(),
        pipeline: SCHEMA_PIPELINE_DATA.required(),
        jobName: Joi.string(),
        build: Joi.object().keys({
            id: Joi.number().integer().required()
        }).unknown(true),
        event: Joi.object(),
        buildLink: Joi.string(),
        isFixed: Joi.boolean()
    });
const SCHEMA_SLACK_CONFIG = Joi.object()
    .keys({
        token: Joi.string().required()
    });

class SlackNotifier extends NotificationBase {
    /**
    * Constructs an SlackNotifier
    * @constructor
    * @param {object} config - Screwdriver config object initialized in API
    */
    constructor(config) {
        super(...arguments);
        this.config = Joi.attempt(config, SCHEMA_SLACK_CONFIG,
            'Invalid config for slack notifications');
    }
    /**
    * Sets listener on server event of name 'eventName' in Screwdriver
    * Currently, event is triggered with a build status is updated
    * @method _notify
    * @param {Object} buildData - Build data emitted with some event from Screwdriver
    */
    _notify(buildData) {
        // Check buildData format against SCHEMA_BUILD_DATA
        try {
            Joi.attempt(buildData, SCHEMA_BUILD_DATA, 'Invalid build data format');
        } catch (e) {
            return;
        }
        if (Object.keys(buildData.settings).length === 0) {
            return;
        }

        // Slack channel overwrite from meta data. Job specific only.
        const metaReplaceVar = `build.meta.notification.slack.${buildData.jobName}.channels`;

        const metaDataSlackChannel = hoek.reach(buildData, metaReplaceVar, { default: false });

        let channelReplacement;

        if (metaDataSlackChannel) {
            channelReplacement = metaDataSlackChannel.split(',');
            // Remove empty/blank items.
            channelReplacement = channelReplacement.filter(
                x => (x.trim() !== ('')));
        }
        // Slack channels from configuration
        if (typeof buildData.settings.slack === 'string' ||
            Array.isArray(buildData.settings.slack)) {
            buildData.settings.slack = (typeof buildData.settings.slack === 'string')
                ? [buildData.settings.slack]
                : buildData.settings.slack;
            buildData.settings.slack = {
                channels: buildData.settings.slack,
                statuses: DEFAULT_STATUSES,
                minimized: false
            };
        }
        if (channelReplacement) {
            buildData.settings.slack.channels = channelReplacement;
        }

        if (buildData.settings.slack.statuses === undefined) {
            buildData.settings.slack.statuses = DEFAULT_STATUSES;
        }

        if (!buildData.settings.slack.statuses.includes(buildData.status)) {
            return;
        }
        const pipelineLink = buildData.buildLink.split('/builds')[0];
        const truncatedSha = buildData.event.sha.slice(0, 6);
        const cutOff = 150;
        const commitMessage = buildData.event.commit.message.length > cutOff ?
            `${buildData.event.commit.message.substring(0, cutOff)}...` :
            buildData.event.commit.message;
        const isMinimized = buildData.settings.slack.minimized;

        let notificationStatus = buildData.status;

        if (buildData.status === 'SUCCESS' && buildData.isFixed) {
            notificationStatus = 'FIXED';
        }

        let message = isMinimized ?
            // eslint-disable-next-line max-len
            `<${pipelineLink}|${buildData.pipeline.scmRepo.name}#${buildData.jobName}> *${buildData.status}*` :
            // eslint-disable-next-line max-len
            `*${notificationStatus}* ${STATUSES_MAP[buildData.status]} <${pipelineLink}|${buildData.pipeline.scmRepo.name} ${buildData.jobName}>`;

        const metaMessage = hoek.reach(buildData,
            'build.meta.notification.slack.message', { default: false });

        const metaVar = `build.meta.notification.slack.${buildData.jobName}.message`;

        const buildMessage = hoek.reach(buildData, metaVar, { default: false });

        // Use job specific message over generic message.
        if (buildMessage) {
            message = `${message}\n${buildMessage}`;
        } else if (metaMessage) {
            message = `${message}\n${metaMessage}`;
        }
        const attachments = isMinimized ?
            [
                {
                    fallback: '',
                    color: COLOR_MAP[buildData.status],
                    fields: [
                        {
                            title: 'Build',
                            value: `<${buildData.buildLink}|#${buildData.build.id}>`,
                            short: true
                        }
                    ]
                }
            ] :
            [
                {
                    fallback: '',
                    color: COLOR_MAP[buildData.status],
                    title: `#${buildData.build.id}`,
                    title_link: `${buildData.buildLink}`,
                    // eslint-disable-next-line max-len
                    text: `${commitMessage} (<${buildData.event.commit.url}|${truncatedSha}>)` +
                            `\n${buildData.event.causeMessage}`
                }
            ];
        const slackMessage = {
            message,
            attachments
        };

        slacker(this.config.token, buildData.settings.slack.channels, slackMessage);
    }

    static validateConfig(config) {
        return Joi.validate(config, SCHEMA_SLACK_SETTINGS);
    }
}

module.exports = SlackNotifier;
