'use strict';

const Joi = require('joi');
const NotificationBase = require('screwdriver-notifications-base');
const schema = require('screwdriver-data-schema');
const hoek = require('@hapi/hoek');
const slacker = require('./slack');

// This should match what is in https://github.com/screwdriver-cd/data-schema/blob/master/models/build.js#L14
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
const SCHEMA_STATUSES = Joi.array().items(schema.plugins.notifications.schemaStatus).min(0);
const SCHEMA_SLACK_CHANNEL = Joi.string().required();
const SCHEMA_SLACK_CHANNELS = Joi.array().items(SCHEMA_SLACK_CHANNEL).min(1);
const SCHEMA_SLACK_SETTINGS = Joi.object()
    .keys({
        slack: Joi.alternatives()
            .try(
                Joi.object().keys({
                    channels: SCHEMA_SLACK_CHANNELS,
                    statuses: SCHEMA_STATUSES,
                    minimized: Joi.boolean()
                }),
                SCHEMA_SLACK_CHANNELS,
                SCHEMA_SLACK_CHANNEL
            )
            .required()
    })
    .unknown(true);
const SCHEMA_BUILD_DATA = Joi.object().keys({
    ...schema.plugins.notifications.schemaBuildData,
    settings: SCHEMA_SLACK_SETTINGS.required()
});
const SCHEMA_JOB_DATA = Joi.object().keys({
    ...schema.plugins.notifications.schemaJobData,
    settings: SCHEMA_SLACK_SETTINGS.required()
});
const SCHEMA_SLACK_CONFIG = Joi.object().keys({
    defaultWorkspace: Joi.string().required(),
    workspaces: Joi.object()
        .unknown()
        .pattern(
            Joi.string(),
            Joi.object().keys({
                token: Joi.string().required()
            })
        )
        .required()
});

/**
 * Handle slack messaging for build status
 * @method buildStatus
 * @param  {Object}         buildData
 * @param  {String}         buildData.status             Build status
 * @param  {Object}         buildData.pipeline           Pipeline
 * @param  {String}         buildData.jobName            Job name
 * @param  {Object}         buildData.build              Build
 * @param  {Object}         buildData.event              Event
 * @param  {String}         buildData.buildLink          Build link
 * @param  {Object}         buildData.settings           Notification setting
 * @param  {Object}         config                       Slack notifications config
 */
function buildStatus(buildData, config) {
    try {
        Joi.attempt(buildData, SCHEMA_BUILD_DATA, 'Invalid build data format');
    } catch (e) {
        return;
    }

    // Slack channel overwrite from meta data. Job specific only.
    const metaReplaceVar = `build.meta.notification.slack.${buildData.jobName}.channels`;

    const metaDataSlackChannel = hoek.reach(buildData, metaReplaceVar, { default: false });

    let channelReplacement;

    if (metaDataSlackChannel) {
        channelReplacement = metaDataSlackChannel.split(',');
        // Remove empty/blank items.
        channelReplacement = channelReplacement.filter(x => x.trim() !== '');
    }
    // Slack channels from configuration
    if (typeof buildData.settings.slack === 'string' || Array.isArray(buildData.settings.slack)) {
        buildData.settings.slack =
            typeof buildData.settings.slack === 'string' ? [buildData.settings.slack] : buildData.settings.slack;
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

    // Add for fixed notification
    if (buildData.isFixed) {
        buildData.settings.slack.statuses.push('FIXED');
    }

    // Do not change the `buildData.status` directly
    // It affects the behavior of other notification plugins
    let notificationStatus = buildData.status;

    if (buildData.settings.slack.statuses.includes('FAILURE')) {
        if (notificationStatus === 'SUCCESS' && buildData.isFixed) {
            notificationStatus = 'FIXED';
        }
    }

    if (!buildData.settings.slack.statuses.includes(notificationStatus)) {
        return;
    }

    const pipelineLink = /^PR-/.test(buildData.jobName)
        ? `${buildData.buildLink.split('/builds')[0]}/pulls`
        : buildData.buildLink.split('/builds')[0];
    const truncatedSha = buildData.event.sha.slice(0, 6);
    const cutOff = 150;
    const commitMessage =
        buildData.event.commit.message.length > cutOff
            ? `${buildData.event.commit.message.substring(0, cutOff)}...`
            : buildData.event.commit.message;

    // Slack channel overwrite from meta data. Job specific only.
    const metaMinimizedReplaceVar = `build.meta.notification.slack.${buildData.jobName}.minimized`;
    const isMinimized = hoek.reach(buildData, metaMinimizedReplaceVar, {
        default: buildData.settings.slack.minimized
    });

    let message = isMinimized
        ? // eslint-disable-next-line max-len
          `<${pipelineLink}|${buildData.pipeline.scmRepo.name}#${buildData.jobName}> *${notificationStatus}*`
        : // eslint-disable-next-line max-len
          `*${notificationStatus}* ${STATUSES_MAP[notificationStatus]} <${pipelineLink}|${buildData.pipeline.scmRepo.name} ${buildData.jobName}>`;

    const rootDir = hoek.reach(buildData, 'pipeline.scmRepo.rootDir', { default: false });

    if (rootDir) {
        message = `${message}\n*Source Directory:* ${rootDir}`;
    }

    const metaMessage = hoek.reach(buildData, 'build.meta.notification.slack.message', { default: false });
    const metaVar = `build.meta.notification.slack.${buildData.jobName}.message`;
    const buildMessage = hoek.reach(buildData, metaVar, { default: false });

    // Use job specific message over generic message.
    if (buildMessage) {
        message = `${message}\n${buildMessage}`;
    } else if (metaMessage) {
        message = `${message}\n${metaMessage}`;
    }

    const attachments = isMinimized
        ? [
              {
                  fallback: '',
                  color: COLOR_MAP[notificationStatus],
                  fields: [
                      {
                          title: 'Build',
                          value: `<${buildData.buildLink}|#${buildData.build.id}>`,
                          short: true
                      }
                  ]
              }
          ]
        : [
              {
                  fallback: '',
                  color: COLOR_MAP[notificationStatus],
                  title: `#${buildData.build.id}`,
                  title_link: `${buildData.buildLink}`,
                  // eslint-disable-next-line max-len
                  text:
                      `${commitMessage} (<${buildData.event.commit.url}|${truncatedSha}>)` +
                      `\n${buildData.event.causeMessage}`
              }
          ];

    const slackMessage = {
        message,
        attachments
    };

    slacker(config, buildData.settings.slack.channels, slackMessage);
}

/**
 * Handle slack messaging for job status
 * @method jobStatus
 * @param  {Object}         jobData
 * @param  {String}         jobData.status             Status
 * @param  {Object}         jobData.pipeline           Pipeline
 * @param  {String}         jobData.jobName            Job name
 * @param  {String}         jobData.pipelineLink       Pipeline link
 * @param  {String}         jobData.message            Message
 * @param  {Object}         jobData.settings           Notification setting
 * @param  {Object}         config                     Slack notifications config
 */
function jobStatus(jobData, config) {
    try {
        Joi.attempt(jobData, SCHEMA_JOB_DATA, 'Invalid job data format');
    } catch (e) {
        return;
    }

    // Slack channels from configuration
    if (typeof jobData.settings.slack === 'string' || Array.isArray(jobData.settings.slack)) {
        jobData.settings.slack =
            typeof jobData.settings.slack === 'string' ? [jobData.settings.slack] : jobData.settings.slack;
        jobData.settings.slack = {
            channels: jobData.settings.slack,
            statuses: DEFAULT_STATUSES,
            minimized: false
        };
    }

    const isMinimized = jobData.settings.slack.minimized;
    const message = isMinimized
        ? // eslint-disable-next-line max-len
          `<${jobData.pipelineLink}|${jobData.pipeline.scmRepo.name}#${jobData.jobName}> *${jobData.status}*\n${jobData.message}`
        : // eslint-disable-next-line max-len
          `*${jobData.status}* ${STATUSES_MAP[jobData.status]} <${jobData.pipelineLink}|${
              jobData.pipeline.scmRepo.name
          } ${jobData.jobName}>\n${jobData.message}`;

    const slackMessage = {
        message
    };

    slacker(config, jobData.settings.slack.channels, slackMessage);
}

class SlackNotifier extends NotificationBase {
    /**
     * Constructs an SlackNotifier
     * @constructor
     * @param {object} config - Screwdriver config object initialized in API
     */
    constructor(config) {
        super(...arguments);
        this.config = Joi.attempt(config, SCHEMA_SLACK_CONFIG, 'Invalid config for slack notifications');
    }

    /**
     * Sets listener on server event of name 'eventName' in Screwdriver
     * @method _notify
     * @param {String} event - Event emitted from Screwdriver
     * @param {Object} payload - Data emitted with some event from Screwdriver
     */
    _notify(event, payload) {
        if (!payload || !payload.settings || Object.keys(payload.settings).length === 0) {
            return;
        }

        switch (event) {
            case 'build_status':
                buildStatus(payload, this.config);
                break;
            case 'job_status':
                jobStatus(payload, this.config);
                break;
            default:
        }
    }

    static validateConfig(config) {
        return SCHEMA_SLACK_SETTINGS.validate(config);
    }
}

module.exports = SlackNotifier;
