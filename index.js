// Sample Configuration
//"platforms": [
//    {
//        "platform": "EcoPlug",
//        "name": "EcoPlug"
//    }
//]

"use strict";

var eco = require('./lib/eco.js');
var debug = require('debug')('EcoPlug');
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {

  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-ecoplugs", "EcoPlug", EcoPlugPlatform);
}

function EcoPlugPlatform(log, config, api) {
  this.log = log;
  this.config = config;
  //    this.plugs = this.config.plugs || [];
  this.accessories = [];
  this.cache_timeout = 10; // seconds
  this.refresh = config['refresh'] || 10; // Update every 10 seconds

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

EcoPlugPlatform.prototype.configureAccessory = function(accessory) {
  var accessoryId = accessory.context.id;
  this.log("configureAccessory", accessoryId, accessory.context.name);
  this.setService(accessory);
  this.accessories[accessoryId] = accessory;
}

EcoPlugPlatform.prototype.didFinishLaunching = function() {
  var that = this;

  eco.startUdpServer(this, function(message) {
    // handle status messages received from devices

    var accessory = that.accessories[message.id];

    if (typeof accessory.context.cb === "function") {
      var cb = accessory.context.cb;
      accessory.context.cb = false;
      // this is the callback from the getPowerState
      cb(null, message.status);
    } else {
      //            accessory.updateReachability(true);
      accessory.getService(Service.Outlet)
        .getCharacteristic(Characteristic.On)
        .updateValue(message.status);
    }
  });
  this.deviceDiscovery();
  setInterval(that.devicePolling.bind(that), this.refresh * 1000);
  setInterval(that.deviceDiscovery.bind(that), this.cache_timeout * 6000);
}

EcoPlugPlatform.prototype.devicePolling = function() {
  // Send a return status message every interval
  for (var id in this.accessories) {
    var plug = this.accessories[id];

    debug("Poll:", id, plug.context.name);
    this.sendStatusMessage(plug.context);

  }
}

EcoPlugPlatform.prototype.deviceDiscovery = function() {
  // Send a device discovery message every interval

  debug("Sending device discovery message");
  eco.discovery(this, function(err, devices) {

    if (err) {
      this.log("ERROR: deviceDisovery", err);
    } else {
      debug("Adding discovered devices");

      for (var i in devices) {
        var existing = this.accessories[devices[i].id];

        if (!existing) {
          this.log("Adding:", devices[i].id, devices[i].name, devices[i].host);
          this.addAccessory(devices[i]);
        } else {

          if (devices[i].host != existing.context.host) {
            this.log("Updating IP Address for", devices[i].id, devices[i].name, devices[i].host);
            existing.context.host = devices[i].host;
          } else {
            debug("Skipping existing device", i, devices[i].host);
          }
        }
      }
    }
    debug("Discovery complete");
  }.bind(this));
}

EcoPlugPlatform.prototype.addAccessory = function(data) {
  if (!this.accessories[data.id]) {
    var uuid = UUIDGen.generate(data.id);

    var accessory = new Accessory(data.id, uuid, 8);

    accessory.context.name = data.name;
    accessory.context.host = data.host;
    accessory.context.port = 80;
    accessory.context.id = data.id;
    accessory.context.cb = false;

    accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "ECO Plugs")
    .setCharacteristic(Characteristic.Model, "CT-065W")
    .setCharacteristic(Characteristic.SerialNumber, accessory.context.id)
    .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    accessory.addService(Service.Outlet, data.name);

    this.setService(accessory);

    this.api.registerPlatformAccessories("homebridge-ecoplugs", "EcoPlug", [accessory]);
  } else {
    var accessory = this.accessories[data.id];
  }

  this.accessories[data.id] = accessory;
}

EcoPlugPlatform.prototype.removeAccessory = function(accessory) {
  if (accessory) {
    var name = accessory.context.name;
    var id = accessory.context.id;
    this.log("Removing EcoPlug: " + name);
    this.api.unregisterPlatformAccessories("homebridge-ecoplugs", "EcoPlug", [accessory]);
    delete this.accessories[id];
  }
}

EcoPlugPlatform.prototype.setService = function(accessory) {
  accessory.getService(Service.Outlet)
    .getCharacteristic(Characteristic.On)
    .on('set', this.setPowerState.bind(this, accessory.context));
//    .on('get', this.getPowerState.bind(this, accessory.context));

  accessory.on('identify', this.identify.bind(this, accessory.context));
}

EcoPlugPlatform.prototype.setPowerState = function(thisPlug, powerState, callback) {
  var that = this;

  var message = eco.createMessage('set', thisPlug.id, powerState);
  var retry_count = 3;

  eco.sendMessage(that, message, thisPlug, retry_count, function(err, message) {
    if (!err) {
      this.log("Setting: %s %s to: %s", thisPlug.id, thisPlug.name, (powerState ? "ON" : "OFF"));
      callback();
    } else {
      this.log("Error Setting: %s %s to: %s", thisPlug.id, thisPlug.name, (powerState ? "ON" : "OFF"));
      callback(err);
    }

  }.bind(this));

}

EcoPlugPlatform.prototype.sendStatusMessage = function(thisPlug, callback) {
  // Send a return status message to a device
  var message = eco.createMessage('get', thisPlug.id);
  var retry_count = 3;

  eco.sendMessage(this, message, thisPlug, retry_count, function(err, message) {
    if (err) {
      this.log.error("Error: sendStatusMessage", thisPlug.id, err.message);
      this.accessories[thisPlug.id].getService(Service.Outlet)
        .getCharacteristic(Characteristic.On)
        .updateValue(new Error("Polling failed"));
      if (callback) {
        callback(err);
      }
    } else {
      if (callback) {
        callback();
      }
    }
  }.bind(this));
}

EcoPlugPlatform.prototype.identify = function(thisPlug, paired, callback) {
  this.log("Identify requested for " + thisPlug.id, thisPlug.name);
  if (this.accessories[thisPlug.id]) {
    this.sendStatusMessage(thisPlug, function(err) {
      if( err ) {
        debug("Identity - Not Found");
        this.removeAccessory(this.accessories[thisPlug.id]);
      } else {
        debug("Identity - Found");
      }
    }.bind(this));
  }
  callback();
}

EcoPlugPlatform.prototype.readState = function(message) {
  return (message.readUInt8(129)) ? true : false;
}

EcoPlugPlatform.prototype.readName = function(message) {
  return (message.toString('ascii', 48, 79));
}
