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

# Installation

1. Install homebridge using: sudo npm install -g homebridge
2. Install this plugin using: sudo npm install -g homebridge-ecoplug
3. Update your configuration file. See below for a sample.

# Configuration

Configuration sample:

 ```
        "platforms": [
            {
                "platform": "EcoPlug",
                "name": "EcoPlug",

            }
        ]
```
## Optional parameters

"port": [9000] incoming port, must be open to discover devices and recieve messages, default is 9000.

```
    "platforms": [
        {
            "port": 9000 //incoming port, must be open
        }
    ]
```


# Firewalls

Please ensure that the any firewalls are set to allow port 9000 incoming, and port 25 outgoing

```
//Example using UFW

//allows incoming message on port 9000
sudo ufw allow incoming 9000

//allows outgoing messages on port 25
sudo ufw allow outgoing 25

```

#Credits

- Danimal4326   - Initial Code and ECOPlug protocol
- NorthernMan54 - Added device auto discovery
- askovi - Tested WiOn Outdoor Outlet 50049
