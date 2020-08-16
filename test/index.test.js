'use strict';

const Hapi = require('@hapi/hapi');
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
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications',
                        url: 'http://scmtest/master'
                    }
                },
                jobName: 'publish',
                build: { id: '1234' },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234'
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('sets statuses for an array of channels in config settings.slack', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: {
                        channels: ['meeseeks']
                    }
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234'
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('sets channels and statuses for simple slack string name', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234'
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('sets channels and statuses for simple slack string name with message', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                message: 'Hello!Meta!'
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('verifies when the build status is FIXED', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FIXED',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                message: 'Hello!FIXED'
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('Job specific slack message. No generic slack message', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                publish: {
                                    message: 'Hello! Publish Meta!'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('Job specific slack message overwriting the generic message', (done) => {
            const buildDataMockSimple = {
                settings: {
                    slack: 'meeseeks'
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                message: 'Hello!Meta!',
                                publish: {
                                    message: 'Hello! Publish Meta!'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('channel meta data overwrite. 2 down to 1 channel', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks', 'second']
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                publish: {
                                    channels: 'onlyonce'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
                buildLink: 'http://thisisaSDtest.com/pipelines/12/builds/1234'
            };

            serverMock.event(eventMock);
            serverMock.events.on(eventMock, data => notifier.notify(data));
            serverMock.events.emit(eventMock, buildDataMockArray);

            process.nextTick(() => {
                assert.calledOnce(WebClientMock.chat.postMessage);
                done();
            });
        });

        it('channel meta data overwrite. should not overwrite. wrong job name', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks', 'second']
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                notpublish: {
                                    channels: 'onlyonce'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('channel meta data overwrite. 1 up to 2 channels', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks']
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                publish: {
                                    channels: 'onlyonce, secondTime'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('channel meta data overwrite. 1 up to 2 channels. Empty item in overwrite', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks']
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234',
                    meta: {
                        notification: {
                            slack: {
                                publish: {
                                    channels: 'onlyonce,, , ,second,, ,'
                                }
                            }
                        }
                    }
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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

        it('sets channels and statuses for an array of channels in config settings', (done) => {
            const buildDataMockArray = {
                settings: {
                    slack: ['meeseeks', 'abcde']
                },
                status: 'FAILURE',
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234'
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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
                pipeline: {
                    id: '123',
                    scmRepo: {
                        name: 'screwdriver-cd/notifications'
                    }
                },
                jobName: 'publish',
                build: {
                    id: '1234'
                },
                event: {
                    id: '12345',
                    causeMessage: 'Merge pull request #26 from screwdriver-cd/notifications',
                    creator: { username: 'foo' },
                    commit: {
                        author: { name: 'foo' },
                        message: 'fixing a bug'
                    },
                    sha: '1234567890abcdeffedcba098765432100000000'
                },
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
            buildDataMock.settings.slack = { room: 'wrongKey', minimized: true };
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
