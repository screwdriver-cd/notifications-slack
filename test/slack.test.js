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
        WebClientConstructorMock = sinon.stub().returns(WebClientMock);
        mockery.registerMock('@slack/client', WebClientConstructorMock);

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

    describe('notifier listens to server emits', () => {
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

        it('do not create client again if there is one', () =>
            slacker(configMock.token, channels, payload)
                .then(slacker(configMock.token, channels, payload))
                .then(assert.calledOnce(WebClientConstructorMock))
        );

        it('gets correct channel ids and post message to channels', () =>
            slacker(configMock.token, channels, payload).then(() => {
                assert.calledTwice(WebClientMock.channels.list);
                assert.calledOnce(WebClientMock.chat.postMessage);
                assert.calledWith(WebClientMock.chat.postMessage, '23', payload.message, {
                    as_true: true,
                    attachments: payload.attachments
                });
            })
        );
    });
});
