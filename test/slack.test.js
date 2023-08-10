'use strict';

const { assert } = require('chai');
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
    let loggerMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        WebClientMock = {
            chat: {
                postMessage: sinon.stub().resolves({})
            }
        };
        WebClientConstructorMock = {
            WebClient: sinon.stub().returns(WebClientMock)
        };
        mockery.registerMock('@slack/web-api', WebClientConstructorMock);

        loggerMock = {
            error: sinon.stub().resolves()
        };
        mockery.registerMock('screwdriver-logger', loggerMock);

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
                defaultWorkspace: 'test-workspace1',
                workspaces: {
                    'test-workspace1': { token: 'test-token1' },
                    'test-workspace2': { token: 'test-token2' }
                }
            };
            channels = ['meeseeks', 'caaaandoooo'];
            payload = {
                message: 'build failed',
                attachments: {}
            };
        });

        it('does not create client again if there is one', () =>
            slacker(configMock, channels, payload)
                .then(slacker(configMock, channels, payload))
                .then(assert.calledOnce(WebClientConstructorMock.WebClient)));

        it('gets correct channel ids and post message to channels', () =>
            slacker(configMock, channels, payload).then(() => {
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
            }));

        it('logs an error if cannt post message to channels', () => {
            WebClientMock.chat.postMessage.rejects(new Error('error!'));

            return slacker(configMock, channels, payload).then(() => {
                assert.calledTwice(loggerMock.error);
            });
        });

        it('logs an error if cannot find the workspace', () => {
            const invalidChannels = ['unknown-workspace:foo', 'bar', 'test-workspace2:baz', 'unknown-workspace:qux'];

            return slacker(configMock, invalidChannels, payload).then(() => {
                assert.calledTwice(loggerMock.error);
            });
        });

        describe('slacker posts message to multi workspaces', () => {
            let WebClientMock1;
            let WebClientMock2;

            beforeEach(() => {
                WebClientMock1 = {
                    chat: {
                        postMessage: sinon.stub().resolves({})
                    }
                };
                WebClientMock2 = {
                    chat: {
                        postMessage: sinon.stub().resolves({})
                    }
                };

                WebClientConstructorMock.WebClient.withArgs('test-token1', sinon.match.any).returns(WebClientMock1);
                WebClientConstructorMock.WebClient.withArgs('test-token2', sinon.match.any).returns(WebClientMock2);

                channels = ['foo', 'test-workspace2:bar', 'test-workspace1:bar', 'test-workspace2:baz'];
            });

            it('does not create client again if there is one', async () => {
                await slacker(configMock, channels, payload);

                assert.calledTwice(WebClientConstructorMock.WebClient);
                assert.calledWith(
                    WebClientConstructorMock.WebClient.firstCall,
                    configMock.workspaces['test-workspace1'].token
                );
                assert.calledWith(
                    WebClientConstructorMock.WebClient.secondCall,
                    configMock.workspaces['test-workspace2'].token
                );
            });

            it('send correct workspace client and post message to channels', async () => {
                await slacker(configMock, channels, payload);

                assert.calledTwice(WebClientMock1.chat.postMessage);
                assert.calledWith(WebClientMock1.chat.postMessage.firstCall, {
                    channel: 'foo',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });
                assert.calledWith(WebClientMock1.chat.postMessage.secondCall, {
                    channel: 'bar',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });

                assert.calledTwice(WebClientMock2.chat.postMessage);
                assert.calledWith(WebClientMock2.chat.postMessage.firstCall, {
                    channel: 'bar',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });
                assert.calledWith(WebClientMock2.chat.postMessage.secondCall, {
                    channel: 'baz',
                    text: payload.message,
                    as_user: true,
                    attachments: payload.attachments
                });
            });
        });
    });
});
