[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

# homebridge-ecoplug
[Homebridge](https://github.com/nfarina/homebridge) platform plugin for Eco and WION Wi-Fi modules and switches

This plugin allows you to remotely control the state of your Eco Plug.  It allows
you to set the on/off state.  This plugin supports device auto discovery, and
will scan the network for new devices every 60 seconds and add new devices.  To
remove devices that are no longer responding, use the 'Identify Accessory' button
on the accessory page of settings on Eve.  It will remove non-responding accessories.

# Tested devices

- ECO Plugs CT-65W Wi-Fi Controlled Outlet
- ~~Woods WiOn 50052 WiFi In-Wall Light Switch~~ This switch has been recalled due to fire hazard
- WiOn Outdoor Outlet 50049
- Wion E211835 RC-031W Indoor Plugs

# Installation

1. Install homebridge using: sudo npm install -g homebridge
2. Install this plugin using: sudo npm install -g homebridge-ecoplug
3. Update your configuration file. See below for a sample.

# Configuration

Configuration sample:

 ```JSON
"platforms": [
    {   //required
        "platform": "EcoPlug",
        "name": "EcoPlug",
        //optional
        "port": 9000,
        //advanced options, optional
        "pollingInterval": 10,
        "discoverInterval": 60,
        "deviceInactiveTimeout": 30,
        "deviceRemoveTimeout": 0,
    }
]
```
## Parameters

Paramenter | Default | Required | Description
-----------| ------- | -------- | -----------
platform | EcoPlug | true | Links configuration information with plugin. _**Do not change. Must be "EcoPlug"**_.
name | EcoPlug | true | Plugin name as displayed in the Homebridge log
port | 9000 | false | Incoming port, must be open on the device to discover devices and receive messages. Must be between 0 and 65535.
pollingInterval | 10 | false | Plls devices for status updates. Use 0 for never (not recommended)
discoverInterval | 60 | false | Clears internal cache after x seconds. Use 0 for never (not recommended)
deviceInactiveTimeout | 30 | false | Set device to inactive after x seconds. Use 0 for never.
deviceRemoveTimeout | 0 | false | Removed device from homebridge when not responding for x seconds. Use 0 for never.

### Homebridge-config-ui-x
These parameters are for homebridge-config-ui-x configuration only and there is no need to add or modify these.
Paramenter | Default | Description
-----------| ------- | -----------
advanceOptions | false | Show or hides advance settings (currently: refresh, cache_timeout, deviceInactiveTimeout, deviceRemoveTimeout)


# Firewalls

Please ensure that the any firewalls are set to allow the port defined in the configuration parameter "port" (default 9000), and port 25 outgoing

```
//Example using UFW

//allows incoming messages incoming port (default 9000)
sudo ufw allow incoming 9000

//allows outgoing messages on port 25
//needed if blocking outgoing messages
sudo ufw allow outgoing 25

```

#Credits

- Danimal4326   - Initial Code and ECOPlug protocol
- NorthernMan54 - Added device auto discovery
- askovi - Tested WiOn Outdoor Outlet 50049
