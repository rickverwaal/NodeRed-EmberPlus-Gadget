module.exports = function(RED) {
    const { EmberClient, EmberClientEvent, LoggingService } = require('node-emberplus');

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // EmberPlus Gadget Config Node (Configuration)
    function EmberPlusServerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.host = config.host;
        node.port = config.port;
        node.connected = false;
        node.statusCallbacks = [];
        node.shutdown = false;

        // Create persistent Ember+ client
        node.client = new EmberClient({
            host: node.host,
            port: node.port,
            logger: new LoggingService(1) // 1 = error only
        });

        // Status handling
        node.sendStatus = function(colour, message, extraInformation = "") {
            node.statusCallbacks.forEach(callback => {
                callback(colour, message, extraInformation);
            });
        };

        node.addStatusCallback = function(callback) {
            node.statusCallbacks.push(callback);
        };

        // Connection handling
        async function connect() {
            if (node.shutdown || node.connected) return;
            
            try {
                node.sendStatus("yellow", "Connecting");
                await node.client.connectAsync();
                node.connected = true;
                node.sendStatus("green", "Connected");
            } catch (err) {
                node.error('Connection error: ' + err);
                node.sendStatus("red", "Connection Error", err.toString());
                // Attempt reconnection after delay
                await delay(5000);
                if (!node.shutdown) connect();
            }
        }

        // Set up event handlers
        node.client.on(EmberClientEvent.ERROR, e => {
            node.error('Ember+ Error: ' + e);
            node.sendStatus("red", "Error", e.toString());
        });

        node.client.on(EmberClientEvent.DISCONNECTED, async () => {
            node.connected = false;
            node.sendStatus("red", "Disconnected");
            if (!node.shutdown) {
                await delay(5000);
                connect();
            }
        });

        // Initial connection
        connect();

        // Cleanup on node removal
        node.on('close', async function(done) {
            node.shutdown = true;
            if (node.client) {
                try {
                    await node.client.disconnectAsync();
                } catch (err) {
                    node.error('Disconnect error: ' + err);
                }
            }
            done();
        });
    }

    // Register config node
    RED.nodes.registerType("emberplus-gadget-config", EmberPlusServerNode);
} 