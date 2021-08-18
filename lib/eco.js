var dgram = require('dgram');
var Parser = require('binary-parser').Parser;
var socket = dgram.createSocket('udp4');
var discovered = [];
const defaultIncomingPort = 9000;
const defaultOutgoingPort = 80;

const MessageBuffer = class MessageBuffer {
    data = {};

    get(id) {
        return this.data[id];
    }

    has(id) {
        return !!this.get[id];
    }

    set(id, timer, callback) {
        this.data[id] = {timer, callback};
    }

    remove(id) {
        if (this.has(id)) {
            const buffer = this.get(id);
            clearTimeout(buffer.timer);
            delete this.data[id];
        }
    }

    empty() {
        for (let buffer of Object.keys(data)) {
            clearTimeout(buffer.timer);
        }
        this.data = {};
    }

    update(id, timer, callback) {
        const buffer = this.get(id);

        timer !== undefined && (buffer.timer = timer);
        callback !== undefined && (buffer.callback = callback);
    }
}

const statusMessageBuffer = new MessageBuffer();
const discoveryMessageBuffer = new MessageBuffer();
const powerMessageBuffer = new MessageBuffer();

const config = {
    messageTimeout: 100,
    messageRetries: 3,
    discoveryMessageTimeout: 100,
    outgoingPort: defaultOutgoingPort,
    incomingPort: defaultIncomingPort
};

exports.startUdpServer = function(that, port = defaultIncomingPort, callback) {
    socket.bind(port);
    socket.on('listening', function() {
        socket.setBroadcast(true);
        that.log(`is listening on port ${port}`);
    });

    socket.on('message', function(message) {
        switch (message.length) {
            case 408:
                // Device discovery response
                handleDiscoverMessage(message);
                //                console.log("408",device.shortid,device.remaining);
                break;
            case 130:
                // getStatus response
                handleStatusMessage(message, callback);
                break;
            case 128:
                // setPower response, what do I do with this?
                handlePowerResponseMessage(message)
                //                console.log("128", action.shortid,action.command1, action.model, action.unknown1, action.remaining);
                //                that.log("128", action.remaining.toString());
                break;
            default:
                that.log("Unknown ECO Message", message.length);
                that.log("Message", message);
                that.log("Message", message.toString());
        }
    }.bind(this));
    return socket;
}

exports.discovery = function(that, callback) {
    var devices;

    discovered = [];
    _sendDiscoveryMessage(createDiscoveryMessage(), 3,function(err, devices) {
        if (!err) {
            callback(null, devices);
        } else {
            that.log("Error", err);
            callback(err);
        }
    }.bind(this));
}


_sendDiscoveryMessage = function(message, retry_count = messageRetries, callback) {
    var timeout;

    socket.send(message, 0, 128, 25, "255.255.255.255", function(err, bytes) {
        if (err) {
            callback(err);
        } else {
            timeout = setTimeout(function() {
                if (retry_count > 1) {
                    var cnt = retry_count - 1;

                    this._sendDiscoveryMessage( message, cnt, callback);
                } else {
                    callback(null, discovered);
                }
            }.bind(this), config.discoveryMessageTimeout);
        }
    }.bind(this));
}


exports.sendMessage = function(that, message, thisPlug, retry_count = config.messageRetries, callback) {

    var timeout;

    socket.send(message, 0, message.length, thisPlug.port, thisPlug.host, function(err, bytes) {

        if (err) {
            callback(err);
        } else {
//            that.log("No ERROR: sendMessage",thisPlug.name,thisPlug.host);
            timeout = setTimeout(function() {
                //socket.close();
                if (retry_count > 1) {

                    var cnt = retry_count - 1;
                    this.sendMessage(that, message, thisPlug, cnt, callback);
                } else {
                    callback(false);
                }
            }.bind(this), config.messageTimeout);
        }
    }.bind(this));

}

const _sendMessage = function(that, message, thisPlug, {retry_count = config.messageRetries, timeout = config.messageTimeout} = {}, callback) {
    let buffer;
    const type = message.type;

    if (type === 'get') {
        buffer = statusMessageBuffer;
    } else if (type === 'set') {
        buffer = powerMessageBuffer;
    } else if (type === 'discovery') {
        buffer = discoveryMessageBuffer;
    } else {
        callback(`Error: Invalid type '${type}'`, null);
        return;
    }

    const timer = buffer.get(host)?.timer;
    if (!timer || retry_count >= 0) {
        socket.send(message, 0, message.length, thisPlug.port, thisPlug.host, function(err, bytes) {
            if (err && retry_count === 0) {
                callback({error: err, plug: thisPlug.id, message: "Error: Unable to send"}, null);
            } else {
                const timer = setTimeout(function () {
                    _sendMessage(that, message, thisPlug, retry_count - 1, callback);
                }.bind(this), timeout);

                buffer.set(host, {timer, callback});
            }
        })
    } else {
        buffer.remove(host);
    }
}

const removeTimer = function removeTimer({id}) {
    clearTimeout(statusMessageBuffer[id].timer);
    delete statusMessageBuffer[id];
}

const handleDiscoverMessage = function handleDiscoverMessage(message, callback = () => {}) {
    const parsedMessage = _parse408Message(message);
    discovered[parsedMessage.id] = parsedMessage;

    removeTimer(parsedMessage);
    callback(null, parsedMessage);
}

const handleStatusMessage = function handleStatusMessage(message, callback = () => {}) {
    const parsedMessage = _parse130Message(message);

    removeTimer(parsedMessage);
    callback(null, parsedMessage);
}

const handlePowerResponseMessage = function handlePowerResponseMessage(message, callback = () => {}) {
    const parsedMessage = _parse128Message(message);
    removeTimer(parsedMessage);
    callback(null, parsedMessage);
}

exports.sendStatusMessage = function sendsendStatusMessage(
    thisPlug,
    getOrSet, //must be 'get' or 'set'
    powerStateSet = undefined,
    options,
    callback
    ) {
    // Send a return status message to a device
    var message = exports.createMessage(getOrSet, ip, powerStateSet);

    this._sendMessage(this, message, thisPlug, options, function(err, message) {
        if (err) {
            callback({error: err, plug: thisPlug.id, message: "Error: Unable to send"}, null);
        } else {
            if (callback) {
                callback(null, message);
            }
        }
    }.bind(this));
}

exports.getStatus = function getStatus(thisPlug, options, callback) {
    this.sendStatusMessage(thisPlug, 'get', undefined, options, callback)
}

exports.setStatus = function setStatus( thisPlug, powerState, options, callback ) {
    this.sendStatusMessage(thisPlug, 'set', powerState, options, callback)
}

exports.createMessage = function(command, id, state) {

    var bufferLength;
    var command1;
    var command2;
    var new_state;
    let type;

    if (command == 'set') {
        type = 'set'
        bufferLength = 130;
        command1 = 0x16000500;
        command2 = 0x0200;
        if (state) {
            new_state = 0x0101;
        } else {
            new_state = 0x0100;
        }
    } else if (command == 'get') {
        type = get;
        bufferLength = 128;
        command1 = 0x17000500;
        command2 = 0x0000;
    } else {
        throw err;
    }

    var buffer = Buffer.alloc(bufferLength, 0);
    buffer.type = type;

    // Byte 0:3 - Command 0x16000500 = Write, 0x17000500 = Read
    buffer.writeUInt32BE(command1, 0);

    // Byte 4:7 - Command sequence num - looks random
    buffer.writeUInt32BE(Math.floor(Math.random() * 0xFFFF), 4);

    // Byte 8:9 - Not sure what this field is - 0x0200 = Write, 0x0000 = Read
    buffer.writeUInt16BE(command2, 8);

    // Byte 10:14 - ASCII encoded FW Version - Set in readback only?

    // Byte 15 - Always 0x0

    // Byte 16:31 - ECO Plugs ID ASCII Encoded - <ECO-xxxxxxxx>
    buffer.write(id, 16, 16);

    // Byte 32:47 - 0's - Possibly extension of Plug ID

    // Byte 48:79 - ECO Plugs name as set in app

    // Byte 80:95 - ECO Plugs ID without the 'ECO-' prefix - ASCII Encoded

    // Byte 96:111 - 0's

    // Byte 112:115 - Something gets returned here during readback - not sure

    // Byte 116:119 - The current epoch time in Little Endian
    buffer.writeUInt32LE((Math.floor(new Date() / 1000)), 116);

    // Byte 120:123 - 0's

    // Byte 124:127 - Not sure what this field is - this value works, but i've seen others 0xCDB8422A
    buffer.writeUInt32BE(0xCDB8422A, 124);

    // Byte 128:129 - Power state (only for writes)
    if (buffer.length == 130) {
        buffer.writeUInt16BE(new_state, 128);
    }

    return buffer;
}

function _parse130Message(message) {
    var response = new Parser()
        .buffer('command1', {
            clone: true,
            length: 6
        })
        .buffer('model', {
            clone: true,
            length: 4
        })
        .string('version', {
            encoding: 'ascii',
            length: 6,
            stripNull: true
        })
        .string('id', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('name', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('shortid', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .buffer('unknown1', {
            clone: false,
            length: 12
        })
        .buffer('unsure', {
            clone: false,
            length: 5
        })
        .uint8('status')
        .array('remaining', {
            type: 'uint8',
            readUntil: 'eof',
            formatter: (a) => Buffer(a)
        });

    return response.parse(message);
}

function _parse128Message(message) {
    var response = new Parser()
        .buffer('command1', {
            clone: true,
            length: 6
        })
        .buffer('model', {
            clone: true,
            length: 4
        })
        .string('version', {
            encoding: 'ascii',
            length: 6,
            stripNull: true
        })
        .string('id', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('name', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('shortid', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .buffer('unknown1', {
            clone: true,
            length: 12
        })
        .array('remaining', {
            type: 'uint8',
            readUntil: 'eof',
            formatter: (a) => Buffer(a)
        });

    return response.parse(message);
}


function _parse408Message(message) {

    var discoveryResponse = new Parser()
        .skip(4)
        .string('version', {
            encoding: 'ascii',
            length: 6,
            stripNull: true
        })
        .string('id', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('name', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .string('shortid', {
            encoding: 'ascii',
            length: 32,
            stripNull: true
        })
        .array('time', {
            type: 'uint8',
            length: 14
        })
        .string('SSID', {
            encoding: 'ascii',
            length: 24,
            stripNull: true
        })
        .array('data2', {
            type: 'uint8',
            length: 16
        })
        .array('data3', {
            type: 'uint8',
            length: 16
        })
        .array('data3a', {
            type: 'uint8',
            length: 8
        })
        .string('password', {
            encoding: 'ascii',
            length: 24,
            stripNull: true
        })
        .array('data4', {
            type: 'uint8',
            length: 10
        })
        .array('data4a', {
            type: 'uint8',
            length: 4
        })
        .string('string2', {
            encoding: 'ascii',
            length: 18,
            stripNull: true
        })
        .array('data5', {
            type: 'uint8',
            length: 12
        })
        .string('region', {
            encoding: 'ascii',
            length: 8,
            stripNull: true
        })
        .string('areacode', {
            encoding: 'ascii',
            length: 4,
            stripNull: true
        })
        .string('a', {
            encoding: 'ascii',
            length: 8,
            stripNull: true
        })
        .string('ipa', {
            encoding: 'ascii',
            length: 16,
            stripNull: true
        })
        .string('ipb', {
            encoding: 'ascii',
            length: 16,
            stripNull: true
        })
        .string('ipc', {
            encoding: 'ascii',
            length: 16,
            stripNull: true
        })
        .array('data6', {
            type: 'uint8',
            length: 18
        })
        .string('string3', {
            encoding: 'ascii',
            length: 30,
            stripNull: true
        })
        .string('mac', {
            encoding: 'ascii',
            length: 18,
            stripNull: true
        })
        .string('host', {
            encoding: 'ascii',
            length: 18,
            stripNull: true
        })
        .array('data7', {
            type: 'uint8',
            length: 3
        })
        .array('remaining', {
            type: 'uint8',
            readUntil: 'eof',
            formatter: (a) => Buffer(a)
        });

    response = discoveryResponse.parse(message);

    if (response.name == "")
        response.name = response.id;
    return response;
}

function createDiscoveryMessage() {
    var message = Buffer.alloc(128, 0);

    message.writeUInt32BE("0x00e0070b", 23);
    message.writeUInt32BE("0x11f79d00", 27);
    message.type = 'discovery';

    return message;
}

const updateConfigDefaultOptions = {
    strict: true
}

/**
 *
 * @param {Object} newConfig Use keys as same key in config, and values as desired new value
 * @description updates configuration will ignore keys different than current configuration
 * @return {undefined} Void
 */
exports.updateConfig = function updateConfig(newConfig = {}, options = updateConfigDefaultOptions) {
    const {strict} = Object.create(updateConfigDefaultOptions, options)

    for (let key of Object.keys(config)) {
        if (newConfig[key] !== undefined) {
            if(!strict || typeof config[key] === typeof newConfig[key]) {
                config[key] = newConfig[key]
            }
        }
    }
}