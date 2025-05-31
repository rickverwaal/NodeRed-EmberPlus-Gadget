module.exports = function(RED) {
    const { EmberClient, EmberClientEvent, LoggingService } = require('node-emberplus');

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Configuration node
    function EmberPlusGadgetsConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.host = config.host;
        this.port = config.port;
    }
    RED.nodes.registerType("emberplus-gadget-config", EmberPlusGadgetsConfigNode);

    // Main node
    function EmberPlusGadgetsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Get the server configuration
        this.server = RED.nodes.getNode(config.server);
        if (!this.server) {
            node.error("Server configuration not found");
            return;
        }

        // Configuration
        this.oid = config.oid;
        this.outputFormat = config.outputFormat || 'array';

        // Create Ember+ client
        const client = new EmberClient({
            host: this.server.host,
            port: this.server.port,
            logger: new LoggingService(1) // 1 = error only
        });

        client.on(EmberClientEvent.ERROR, e => {
            node.error('Ember+ Error: ' + e);
        });

        // Handle incoming messages
        node.on('input', async function(msg) {
            try {
                await client.connectAsync();
                // Use msg.oid if provided, otherwise use configured OID
                const oidToUse = msg.oid || this.oid;
                // Walk the OID path step by step to avoid PathDiscoveryFailureError
                const pathParts = oidToUse.split('.');
                let currentPath = '';
                let currentNode = null;
                for (const part of pathParts) {
                    currentPath = currentPath ? `${currentPath}.${part}` : part;
                    currentNode = await client.getElementByPathAsync(currentPath);
                    if (!currentNode) {
                        node.error(`Node not found at ${currentPath}`);
                        await client.disconnectAsync();
                        return;
                    }
                }
                const targetNode = currentNode;
                if (targetNode && targetNode.contents) {
                    const value = targetNode.contents.value;
                    const description = targetNode.contents.description;
                    const oid = oidToUse;
                    if (this.outputFormat === 'object') {
                        msg.payload = { oid, value, description };
                    } else if (this.outputFormat === 'value') {
                        msg.payload = value;
                    } else {
                        msg.payload = [oid, value, description];
                    }
                    node.send(msg);
                } else {
                    node.error('Node not found or has no contents.');
                }
            } catch (err) {
                node.error('Error: ' + err);
            } finally {
                await client.disconnectAsync();
            }
        });

        // Clean up on node removal
        node.on('close', async function() {
            await client.disconnectAsync();
        });
    }

    // Register the node
    RED.nodes.registerType("emberplus-gadget", EmberPlusGadgetsNode);
} 