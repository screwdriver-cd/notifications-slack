'use strict';

const Hapi = require('hapi');
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });
describe('index', () => {
    const eventMock = 'build_status_test';

    let SlackNotifier;
    let serverMock;
    let configMock;
    let notifier;
    let buildDataMock;
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
                    }]
                })
            },
            chat: {
                postMessage: sinon.stub().resolves('fffff')
            }
        };

        WebClientConstructorMock = {
            WebClient: sinon.stub().returns(WebClientMock)
        };
        mockery.registerMock('@slack/client', WebClientConstructorMock);

        // eslint-disable-next-line global-require
        SlackNotifier = require('../index');
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
            serverMock = new Hapi.Server();
            configMock = {
                token: 'y353e5y45'
            };
            buildDataMock = {
                settings: {
                    slack: {
                        channels: ['meeseeks', 'caaaandoooo', 'aaa'],
                        statuses: ['SUCCESS', 'FAILURE']
                    }
                },
                status: 'SUCCESS',
                pipelineName: 'screwdriver-cd/notifications',
                jobName: 'publish',
                buildId: '1234',
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };
            notifier = new SlackNotifier(configMock);
        });

        it('verifies that included status creates slack notifier', (done) => {
            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMock);

            process.nextTick(() => {
                assert.calledWith(WebClientConstructorMock.WebClient, configMock.token);
                assert.calledThrice(WebClientMock.chat.postMessage);
                done();
            });
        });

        it('verifies that non-included status does not send a notification', (done) => {
            const buildDataMockUnincluded = {
                settings: {
                    slack: {
                        channels: ['meeseeks', 'caaaandoooo', 'aaa', 'fddfdfdf'],
                        statuses: ['SUCCESS', 'FAILURE']
                    }
                },
                status: 'invalid_status',
                pipelineName: 'screwdriver-cd/notifications',
                jobName: 'publish',
                buildId: '1234',
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockUnincluded);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });

        it('verifies that non-subscribed status does not send a notification', (done) => {
            const buildDataMockUnincluded = {
                settings: {
                    slack: {
                        channels: ['meeseeks', 'caaaandoooo', 'aaa', 'fddfdfdf'],
                        statuses: ['SUCCESS', 'FAILURE']
                    }
                },
                status: 'ABORTED'
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockUnincluded);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });

        it('sets channels and statuses for simple slack string name', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FAILURE',
                pipelineName: 'screwdriver-cd/notifications',
                jobName: 'publish',
                buildId: '1234',
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockSimple);

            process.nextTick(() => {
                assert.calledOnce(WebClientMock.chat.postMessage);
                done();
            });
        });

        it('sets channels and statuses for an array of channels in config settings', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks', 'abcde']
                },
                status: 'FAILURE',
                pipelineName: 'screwdriver-cd/notifications',
                jobName: 'publish',
                buildId: '1234',
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockArray);

            process.nextTick(() => {
                assert.calledTwice(WebClientMock.chat.postMessage);
                done();
            });
        });

        it('allows additional notifications plugins in buildData.settings', (done) => {
            buildDataMock.settings.hipchat = {
                awesome: 'sauce',
                catch: 22
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMock);

            process.nextTick(() => {
                assert.calledWith(WebClientConstructorMock.WebClient, configMock.token);
                done();
            });
        });

        it('returns when buildData.settings is empty', (done) => {
            delete buildDataMock.settings.slack;

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMock);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });
    });

    describe('config is validated', () => {
        it('validates token', () => {
            configMock = {};
            try {
                notifier = new SlackNotifier(configMock);
                assert.fail('should not get here');
            } catch (err) {
                assert.instanceOf(err, Error);
                assert.equal(err.name, 'ValidationError');
            }
        });
    });

    describe('buildData is validated', () => {
        beforeEach(() => {
            serverMock = new Hapi.Server();
            configMock = {
                token: 'faketoken'
            };
            buildDataMock = {
                settings: {
                    slack: {
                        channels: ['notifyme', 'notifyyou'],
                        statuses: ['SUCCESS', 'FAILURE']
                    }
                },
                status: 'SUCCESS',
                pipelineName: 'screwdriver-cd/notifications',
                jobName: 'publish',
                buildId: '1234',
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };

            notifier = new SlackNotifier(configMock);
        });

        it('validates status', (done) => {
            buildDataMock.status = 22;
            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMock);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });

        it('validates slack settings', (done) => {
            buildDataMock.settings.slack = { room: 'wrongKey' };
            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMock);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });

        it('validates buildData format', (done) => {
            const buildDataMockInvalid = ['this', 'is', 'wrong'];

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockInvalid);

            process.nextTick(() => {
                assert.notCalled(WebClientConstructorMock.WebClient);
                done();
            });
        });
    });
});
