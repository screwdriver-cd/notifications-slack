'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });
describe('slack', () => {
    let configMock;
    let channels;
    let payload;
    let slacker;
    let WebClientMock;
    let WebClientConstructorMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        WebClientMock = {
            channels: {
                list: sinon.stub().resolves({
                    channels: [{
                        name: 'meeseeks',
                        id: '23'
                    }, {
                        name: 'dd',
                        id: '21'
                    }]
                })
            },
            chat: {
                postMessage: sinon.stub().resolves({})
            }
        };
        WebClientConstructorMock = {
            WebClient: sinon.stub().returns(WebClientMock)
        };
        mockery.registerMock('@slack/web-api', WebClientConstructorMock);

        // eslint-disable-next-line global-require
        slacker = require('../slack');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('slacker posts message to channels', () => {
        beforeEach(() => {
            configMock = {
                token: 'y353e5y45'
            };
            channels = ['meeseeks', 'caaaandoooo'];
            payload = {
                message: 'build failed',
                attachments: {}
            };
        });

        it('does not create client again if there is one', () =>
            slacker(configMock.token, channels, payload)
                .then(slacker(configMock.token, channels, payload))
                .then(assert.calledOnce(WebClientConstructorMock.WebClient))
        );

        it('gets correct channel ids and post message to channels', () =>
            slacker(configMock.token, channels, payload).then(() => {
                assert.calledTwice(WebClientMock.chat.postMessage);
                assert.calledWith(WebClientMock.chat.postMessage.firstCall, {
                    channel: 'meeseeks',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });
                assert.calledWith(WebClientMock.chat.postMessage.secondCall, {
                    channel: 'caaaandoooo',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });
            })
        );

        it('logs an error if cannt post message to channels', () => {
            WebClientMock.chat.postMessage.rejects(new Error('error!'));

            return slacker(configMock.token, channels, payload).then(() => {
                it('should catch an error', () => {
                    // eslint-disable-next-line no-console
                    assert.calledTwice(console.error);
                });
            });
        });
    });
});
