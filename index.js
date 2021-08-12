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
var Accessory, Service, Characteristic, UUIDGen, HAPServer;
var accessories = {};

//default configuration
const defaultIncomingPort = 9000;
const defaultPollingInterval = 10; // Update every 10 seconds
const defaultDiscoverInterval = 60; // clear cache every 60 seconds
const defaultDeviceInactiveTimeout = defaultDiscoverInterval * 3; // set devices inactive after x number of seconds of no response, 0 is set to never;
const defaultDeviceRemoveTimeout = 0; // remove any devices after x number of seconds if is missing, 0 is set to never;
const defaultEnabled = true;

module.exports = function(homebridge) {

  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  HAPServer = homebridge.hap.HAPServer;

  homebridge.registerPlatform("homebridge-ecoplug", "EcoPlug", EcoPlugPlatform);
}

function EcoPlugPlatform(log, config, api) {
  this.log = log;
  this.discoverInterval = pickFirstDefined(config['discoverInterval'], defaultDiscoverInterval); // seconds
  this.pollingInterval = convertToMilliseconds( pickFirstDefined(config['pollingInterval'], defaultPollingInterval)); // Update every 10 seconds
  this.deviceRemoveTimeout = convertToMilliseconds( pickFirstDefined(config['deviceInactiveTimeout'], defaultDeviceRemoveTimeout));
  this.deviceInactiveTimout = convertToMilliseconds( pickFirstDefined(config['deviceInactiveTimeout'], defaultDeviceInactiveTimeout));
  this.enabled = pickFirstDefined(config.enabled, defaultEnabled);
  this.config = config;

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

EcoPlugPlatform.prototype.configureAccessory = function(accessory) {
  var accessoryId = accessory.context.id;
  this.log("configureAccessory", accessoryId, accessory.context.name);
  this.setService(accessory);
  accessory.context.lastUpdated = Date.now();
  accessories[accessoryId] = accessory;
}

EcoPlugPlatform.prototype.didFinishLaunching = function() {
  if (this.enabled) {
    eco.startUdpServer(this, this.config.port = defaultIncomingPort, function(message) {
      // handle status messages received from devices
      var accessory = accessories[message.id];

      //check if error, and logs message if changing from error
      if (accessories[message.id].getService(Service.Outlet).getCharacteristic(Characteristic.On).status instanceof Error) {
        const accessoryInfo = accessory.getService(Service.AccessoryInformation)
        this.log('Plug set to active', accessoryInfo.getCharacteristic(message.id), accessoryInfo.getCharacteristic(Characteristic.name))
      }

      accessory.getService(Service.Outlet)
        .getCharacteristic(Characteristic.On)
        .updateValue(message.status);

      accessory.context.lastUpdated = Date.now();
    });

    this.deviceDiscovery(); //initial device discovery
    this.pollingInterval > 0 && setInterval(this.devicePolling.bind(this), this.pollingInterval); //polls discovered devices to check their status
    this.discoverInterval > 0 && setInterval(this.deviceDiscovery.bind(this), this.discoverInterval); //rechecks for new devices and inactivates inactive ones.
  } else {
    this.log('is disabled')
  }
}

EcoPlugPlatform.prototype.devicePolling = function() {
  // Send a return status message every interval
  for (var id of Object.keys(accessories)) {
    var plug = accessories[id];

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
        var existing = accessories[devices[i].id];

        if (!existing) {
          this.log("Adding:", devices[i].id, devices[i].name, devices[i].host);
          this.addAccessory(devices[i]);
        } else {

          if (devices[i].host != existing.context.host) {
            this.log("Updating IP Address for", devices[i].id, devices[i].name, devices[i].host);
            existing.context.host = devices[i].host;
          } else {
            debug("Skipping existing device", i, devices[i].name);
          }
        }
      }
    }
    debug("Discovery complete");
  }.bind(this));
}

EcoPlugPlatform.prototype.addAccessory = function(data) {
  if (!accessories[data.id]) {
    var uuid = UUIDGen.generate(data.id);

    var accessory = new Accessory(data.id, uuid, 8);

    accessory.context.name = data.name;
    accessory.context.host = data.host;
    accessory.context.port = 80;
    accessory.context.id = data.id;

    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "ecoplug")
      .setCharacteristic(Characteristic.Model, "CT-065W")
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.id)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    accessory.addService(Service.Outlet, data.name);

    this.setService(accessory);

    this.api.registerPlatformAccessories("homebridge-ecoplug", "EcoPlug", [accessory]);
  } else {
    var accessory = accessories[data.id];
  }

  accessories[data.id] = accessory;
}


EcoPlugPlatform.prototype.setService = function(accessory) {
  accessory.getService(Service.Outlet)
    .getCharacteristic(Characteristic.On)
    .on('set', this.setPowerState.bind(this, accessory.context));

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
      accessories[thisPlug.id].getService(Service.Outlet)
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

  if (((Date.now() - thisPlug.lastUpdated) > this.deviceRemoveTimeout) && this.deviceRemoveTimeout !== 0) {
    // if not status update have not been recieved after deviceRemoveTimout, remove device
    // debug("Plug not responding. Removing Plug:", thisPlug.id, thisPlug.name);
    this.log("Removing Plug. Plug not responding", thisPlug.id, thisPlug.name)
    this.removeAccessory(accessories[thisPlug.id]);

  } else if (((Date.now() - thisPlug.lastUpdated) > this.deviceInactiveTimout) && this.deviceInactiveTimout !== 0) {
    // If no status update received for 3 refresh cycles, mark as not available
    if (!(accessories[thisPlug.id].getService(Service.Outlet).getCharacteristic(Characteristic.On).status instanceof Error)) {
      // debug("Plug not responding", thisPlug.id, thisPlug.name);
      this.log("Set Plug to Inactive: Plug not responding", thisPlug.id, thisPlug.name)
      accessories[thisPlug.id].getService(Service.Outlet)
        .updateCharacteristic(Characteristic.On, new Error("No Response"))
        // .getCharacteristic(Characteristic.On)
        // .setValue(new Error("No Response"));
    }
  }
}

EcoPlugPlatform.prototype.identify = function(thisPlug, paired, callback) {
  this.log("Identify requested for " + thisPlug.id, thisPlug.name);
  if (accessories[thisPlug.id].getService(Service.Outlet).getCharacteristic(Characteristic.On).status instanceof Error) {
    debug("Identity - Not Found, remove device", thisPlug.id);
    this.removeAccessory(accessories[thisPlug.id]);
  }
  callback();
}

EcoPlugPlatform.prototype.removeAccessory = function(accessory) {
  if (accessory) {
    var id = accessory.context.id;
    this.log("Removing EcoPlug: " + accessory.context.name);
    this.api.unregisterPlatformAccessories("homebridge-ecoplug", "EcoPlug", [accessory]);
    delete accessories[id];
  }
}

const convertToMilliseconds = function convertToSeconds(seconds) {
  return seconds * 1000;
}

const pickFirstDefined = function pickFirstDefined(...options) {
  for (let option of options) {
    if (option !== undefined) {
      return option
    }
  }
}